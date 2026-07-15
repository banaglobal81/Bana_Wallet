# BANA Staking Worker

A tiny cron that runs the staking interest settlement. It does **not** touch the
database — it calls a secret-protected endpoint on the web app
(`POST /api/cron/staking`), which owns the DB and the accrual logic. One source of
truth, no duplicated DB setup.

Deployed on **Railway** as a cron service. The entry point is `trigger.mjs` — plain
Node `fetch`, zero dependencies: it calls the endpoint once, logs the result, exits.

> **Not related to Cloudflare R2.** The app's R2 logo storage lives in the web app
> (`web/src/lib/r2.ts`) and has nothing to do with this worker.

## What it does
- Fires on the schedule set in the Railway dashboard.
- Calls `POST {WEB_URL}/api/cron/staking` with the `x-cron-secret` header.
- The web app pays each unpaid elapsed day (idempotent) and flips matured stakes to `MATURED`.

## Setup (Railway)

Railway builds this folder as a Node service and runs it on a **Cron Schedule**.

1. Railway → **New service → GitHub repo** (this repo).
2. Service **Settings**:
   - **Root Directory:** `worker`
   - **Cron Schedule:** e.g. `0 0 * * *` (daily) or `*/5 * * * *` (every 5 min, demo).
     **Required.** Without it the service runs continuously, and since the script
     exits, Railway restarts it in a loop.
   - **Start Command:** `node trigger.mjs` (set in `railway.json`).
3. Service **Variables** — both required, or the script exits with an error:
   - `WEB_URL` = `https://banawallet.com`
   - `CRON_SECRET` = **the same value** as the web app's `CRON_SECRET`.
     Tip: use a Railway reference (`${{shared.CRON_SECRET}}`) so the two can't drift apart.
4. Deploy, then check **Deploy Logs** for `[staking-cron] 200 {...}`.

### The schedule lives in Railway, not in this repo
There is no cron expression in any file here — Railway owns it (Settings → Cron
Schedule). Changing code will never change how often this runs.

## Troubleshooting (read the Deploy Logs)
| Log line | Meaning |
|---|---|
| `200 {"ok":true,...}` | Working. |
| `WEB_URL is not set` | Add the `WEB_URL` variable. |
| `CRON_SECRET is not set` | Add the `CRON_SECRET` variable. |
| `503 {"error":"CRON_SECRET not configured"}` | The **web app** has no `CRON_SECRET` — add it there and redeploy it. |
| `401` | The two `CRON_SECRET` values don't match. |

Note: after adding `CRON_SECRET` to the **web app**, it must redeploy before the new
value is live — a run before that finishes still returns 503.

## Notes
- Settlement is **idempotent** — running it often is safe (days are tracked by
  `daysPaid` + a unique `[positionId, dayIndex]`, so nothing is ever double-paid).
- The web app also computes accrual live on read, so the UI ticks up between runs;
  this worker credits the **real** payouts into the rewards ledger.
- Admins can also trigger the same settlement by hand: **Admin → Staking → "Run
  settlement now"** (identical logic, no worker involved).
