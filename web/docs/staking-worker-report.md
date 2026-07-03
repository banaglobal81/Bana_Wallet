# BANA Staking — Cron Worker Review Report

**Date:** 2026‑07‑03
**Scope:** The Cloudflare Worker (`worker/`) that triggers the daily staking interest settlement, and the web endpoint it calls (`POST /api/cron/staking`).
**Method:** Static review of `worker/src/index.ts`, `worker/wrangler.toml`, `worker/package.json`, `worker/README.md`, and `web/src/app/api/cron/staking/route.ts`. The worker→endpoint path itself was previously exercised end‑to‑end (see `staking-e2e-report.md`, 6/6 passed).
**Verdict:** ✅ **Code is correct and safe.** The worker matches the endpoint contract exactly. **Not yet deployed** — 3 config/deploy steps remain (below). One low‑severity hardening recommendation.

---

## 1. What the worker is

A tiny Cloudflare Worker with a **Cron Trigger**. It owns **no** database logic — on schedule it just calls a secret‑protected endpoint on the web app, which owns the DB + settlement logic (single source of truth).

```
Cloudflare Cron (00:00 UTC daily)
      │  scheduled()
      ▼
POST {WEB_URL}/api/cron/staking     header: x-cron-secret: <CRON_SECRET>
      ▼
Web app: for each ACTIVE stake, pay each unpaid elapsed day
         → one StakingPayout row per day (idempotent)
         → flip matured stakes to MATURED (unlocks principal)
```

- **Schedule:** `crons = ["0 0 * * *"]` — daily at 00:00 UTC (`wrangler.toml`).
- **Two handlers:** `scheduled()` (the cron) and `fetch()` (manual trigger / health check).
- **Error handling:** `scheduled()` wraps the call in `ctx.waitUntil(...)` and logs success/failure to the Worker console (`wrangler tail`).

## 2. Contract check — worker vs. endpoint ✅

| Item | Worker sends | Endpoint expects | Match |
|---|---|---|---|
| Method | `POST` | `POST` does the work | ✅ |
| Auth header | `x-cron-secret: <CRON_SECRET>` | `req.headers.get('x-cron-secret') === process.env.CRON_SECRET` | ✅ |
| URL | `{WEB_URL}/api/cron/staking` (trailing slash stripped) | route at `/api/cron/staking` | ✅ |
| Response handling | reads status + body text, logs | returns JSON `{ ok, data:{ processed, matured, daysCredited, totalPaid, at } }` | ✅ |

The endpoint also rejects cleanly: **503** if `CRON_SECRET` is unset on the web app, **401** if the header is missing/wrong.

## 3. Correctness & resilience findings

**✅ Idempotent — safe to re‑run.** Payouts are written one row per `dayIndex` with a DB `@@unique([positionId, dayIndex])` + `createMany({ skipDuplicates: true })`, and totals are recomputed (`perDay × dueDays`), never incremented blindly. Running the cron twice in a day, or a duplicate trigger, **cannot double‑pay**.

**✅ Missed runs self‑heal (important strength).** The endpoint computes `dueDays` from `startAt` and pays **all** unpaid days (`daysPaid+1 … dueDays`). So if the web app is down at 00:00 UTC and the run fails, the **next** successful run automatically catches up every missed day. **No interest is lost** to a transient outage.

**✅ Concurrency/scale‑safe.** The unique constraint + `skipDuplicates` + recomputed totals make concurrent or overlapping runs non‑double‑counting. (Railway is single‑replica anyway.)

**ℹ️ Timezone:** cron fires at 00:00 UTC and `daysElapsed` counts whole elapsed days from `startAt`. A stake opened at 23:59 UTC accrues its first day ~24h later. Expected behavior.

## 4. Issues / recommendations

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | **Low (hardening)** | The worker's **`fetch()` handler runs the full settlement with no auth** — anyone who learns the Worker URL can trigger the job (the worker holds the secret). **No financial risk** (idempotent, and it only flips positions whose term has genuinely elapsed), but it's an unauthenticated way to trigger DB writes. | Gate `fetch()` behind a query token (e.g. `?key=…` compared to a secret), disable it in production, or map it to the endpoint's lightweight **GET** health check instead of a full POST. |
| 2 | **Blocker for deploy** | `wrangler.toml` still has the placeholder `WEB_URL = "https://your-web-app-url"`. | Set it to the real prod URL, e.g. `https://banawallet.com` (or the Railway URL). |
| 3 | **Blocker for deploy** | `CRON_SECRET` must exist in **two** places and be **identical**: the Worker secret **and** the web app's env on Railway. Mismatch → 401; missing on web → 503. | `wrangler secret put CRON_SECRET` on the worker **and** set the same `CRON_SECRET` in Railway variables. Generate with `openssl rand -hex 32`. |
| 4 | Info | Worker deps not installed / `WEB_URL` still a placeholder ⇒ **the worker has not been deployed to Cloudflare yet**. | `cd worker && npm install && npm run deploy`. |
| 5 | Info (optional) | Only one daily firing. | Optionally add a second cron (e.g. `"0 12 * * *"`) for extra resilience — safe because it's idempotent. |

## 5. Deploy checklist (to make the daily payout go live)

```bash
# 0) On the web app (Railway) — set the shared secret in Railway → Variables:
#    CRON_SECRET = <a strong random value>          # e.g. openssl rand -hex 32

# 1) Point the worker at production
#    edit worker/wrangler.toml →  WEB_URL = "https://banawallet.com"

cd worker
npm install
wrangler secret put CRON_SECRET      # paste the SAME value as Railway's CRON_SECRET
npm run deploy                        # deploys the cron worker to Cloudflare
```

**Verify after deploy:**
- Cloudflare dashboard → the worker → **Triggers** shows the `0 0 * * *` cron.
- Manual smoke test: `GET` the deployed Worker URL → should return `staking-cron → 200 {"ok":true,...}` (this runs one accrual — safe, idempotent). *(If you apply fix #1, use whatever auth you add.)*
- `wrangler tail` shows a `[staking-cron] 200 …` line at the next 00:00 UTC firing.

## 6. Bottom line

The worker is **correctly written, minimal, and safe** — right separation of concerns (no DB in the worker), exact contract match with the endpoint, idempotent, and it self‑heals missed runs. It just needs the **3 deploy/config steps** in §5 (set `WEB_URL`, set matching `CRON_SECRET` in both Cloudflare and Railway, `wrangler deploy`). I recommend also applying hardening **#1** (protect the public `fetch()` trigger) before it's live for real users.
