# BANA Staking System & Cron Worker — Status Report

**Prepared for:** Senior review
**Date:** 2026‑07‑03
**Scope:** (A) the daily‑interest staking system, and (B) the Cloudflare cron worker that drives its daily payout.
**Overall status:** ✅ **Core built, tested, and correct.** Staking is live locally with full daily payouts. **Three deploy/config steps remain** to switch the daily engine on in production, plus one small worker hardening item.

---

## Executive summary

- The **staking system** implements the PowerPoint spec exactly: 5 fixed lock tiers, daily interest by tier, "settled and paid automatically every day," fee‑funded, no MLM in the core. **Tested end‑to‑end: 6/6 E2E checks + 7/7 math unit tests passed.**
- The **worker** is a small Cloudflare Cron Trigger that fires once a day and calls the web app's settlement endpoint. It contains **no staking logic by design** — the web app is the single source of truth. Reviewed: **correct, idempotent, self‑healing.**
- **What's left before real users:** (1) set the worker's `WEB_URL`, (2) set a matching `CRON_SECRET` in both Railway and Cloudflare, (3) `wrangler deploy` the worker. Plus (4) seed the staking products into the production DB, and (5) confirm two open **policy** numbers (360‑day rate; BANA amount brackets).

---

## Part A — Staking system

### A.1 What was built (per the spec)
- **5 fixed lock tiers:** 10 · 30 · 90 · 180 · 360 days — longer lock = higher daily rate.
- **Daily interest** by tier: 0.2% / 0.5% / 0.7% / 1.0% / (360‑day = 1.3% *placeholder, TBD*).
- **Real daily payout** — every day, each active stake is credited its day's interest, written as **one auditable ledger row per day** (`StakingPayout`), and matured stakes flip to `MATURED` (principal unlocks).
- **Two products:** USDT and BANA Token.
- All money math uses `decimal.js` (no floating‑point drift).
- **Not built (deliberately):** referral / multi‑level (MLM) layers — the deck marks those DRAFT / "requires separate legal review."

**Payout formula:** `interest_for_day = principal × (dailyRate% / 100)`, credited once per elapsed day up to the term. Total at maturity = `principal × rate% × termDays`.

### A.2 Test results — ✅ all passed

**End‑to‑end (worker → payout endpoint → database): 6/6**

| Scenario | Principal | Rate | Elapsed | Days paid | Interest paid | Status | ✓ |
|---|---|---|---|---|---|---|---|
| 90‑day, mid‑term | 5,000 | 0.7%/day | 3 | 3 | 105 | ACTIVE | ✅ |
| 10‑day, past term | 200 | 0.2%/day | 12 → cap 10 | 10 | 4 | **MATURED** | ✅ |
| 30‑day, fresh | 1,000 | 0.5%/day | 0 | 0 | 0 | ACTIVE | ✅ |
| 180‑day | 20,000 | 1.0%/day | 7 | 7 | 1,400 | ACTIVE | ✅ |

- **Idempotency:** re‑running immediately credited **0** extra days — no day is ever paid twice. ✅
- **Maturity:** the past‑term stake paid exactly the term (10 days, not 12 — correctly capped) and unlocked. ✅
- **Rewards ledger total:** 105 + 4 + 0 + 1,400 = **1,509 USDT**, matches the sum of per‑stake paid interest. ✅
- **Math unit tests:** **7/7 passed** (daily interest, term cap, maturity, no float drift, etc.).

### A.3 Open items (policy — need your decision)
1. **360‑day daily rate** — not in the deck; currently a **placeholder (1.3%/day)**. Please confirm.
2. **BANA product brackets** (min/max amounts) — currently a **starting suggestion (~10× the USDT tiers)**. Please confirm.
3. **Rewards → withdrawable balance** — earned interest is recorded in the ledger (source of truth). Moving it into a user's *withdrawable* balance is the next integration; it's a treasury decision because the reward pool is fee‑funded.

---

## Part B — Cron worker

### B.1 What it is
A tiny **Cloudflare Worker (Cron Trigger)** in `worker/`. Once a day (00:00 UTC) it sends `POST /api/cron/staking` to the web app with a shared secret header. It holds **no** database or staking logic — the web app owns all of it. This keeps a single source of truth and means rate/tier changes never require touching the worker.

```
Cloudflare Cron (daily 00:00 UTC)  ──POST + secret──►  Web app: pay each unpaid day, mature ended stakes
        (the alarm clock)                                        (the brain — rates, math, database)
```

### B.2 Review result — ✅ correct
- **Contract matches** the endpoint exactly (method, `x-cron-secret` header, URL). ✅
- **Idempotent:** a DB unique constraint (`[positionId, dayIndex]`) + recomputed totals mean duplicate or repeated runs **cannot double‑pay**. ✅
- **Self‑healing:** if the web app is down at 00:00 UTC and a run fails, the **next** run automatically pays all missed days (it computes from the stake's start date). **No interest is ever lost** to a transient outage. ✅
- **Concurrency‑safe** even if triggered more than once. ✅

### B.3 What needs fixing / doing on the worker

| # | Type | Item | Action |
|---|---|---|---|
| 1 | **Code (hardening)** | The worker's manual `fetch()` trigger currently runs the full settlement with **no auth** (idempotent, so no financial risk, but it shouldn't be open). | Add a token check or disable it in production. |
| 2 | **Config** | `WEB_URL` is still the placeholder `https://your-web-app-url`. | Set to `https://banawallet.com`. |
| 3 | **Secret** | `CRON_SECRET` must exist and be **identical** in **both** Railway (web app) and Cloudflare (worker). Mismatch → 401; missing → 503; either way, no payouts. | Set the same value in both. |
| 4 | **Deploy** | The worker has not been deployed yet. | `cd worker && npm install && wrangler deploy`. |

---

## Part C — Go‑live checklist

```bash
# 1) Seed the staking products into the PRODUCTION database
#    (already added to the Railway start command so it runs on the next deploy;
#     or run once: Railway → web service → `npm run db:seed:staking`)

# 2) Shared secret — set the SAME value in both places
#    Railway → Variables:            CRON_SECRET = <openssl rand -hex 32>
#    Cloudflare worker:              wrangler secret put CRON_SECRET

# 3) Point the worker at production
#    worker/wrangler.toml →          WEB_URL = "https://banawallet.com"

# 4) Deploy the worker
cd worker && npm install && wrangler deploy
```

**Verify:** Cloudflare → worker → Triggers shows the `0 0 * * *` cron; `wrangler tail` shows `[staking-cron] 200 …` at the next firing; user staking page shows accrued/paid interest growing daily.

---

## Bottom line

The **staking engine is done and proven correct** (6/6 E2E, 7/7 unit tests, real daily payouts, idempotent, maturity/unlock, audit ledger). The **worker is correct** and intentionally minimal. Remaining work is **deployment + two policy confirmations**, not new engineering:

- ✅ Built & tested: tiers, daily payout, maturity, ledger, worker logic, USDT + BANA.
- ⏳ Deploy: set `WEB_URL`, matching `CRON_SECRET` (Railway + Cloudflare), `wrangler deploy`, seed prod products.
- ❓ Your decision: 360‑day rate, BANA brackets, rewards‑to‑withdrawable integration, MLM (deferred).
