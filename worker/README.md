# BANA Staking Worker

An always-on process that runs the staking interest settlement on a configurable
schedule. It does **not** touch the database — it calls a secret-protected endpoint on
the web app (`POST /api/cron/staking`), which owns the DB and the accrual logic. One
source of truth, no duplicated DB setup.

Deployed on **Railway** as a normal always-on service. The entry point is `trigger.mjs`
— plain Node `fetch`, zero dependencies: it polls the schedule from the web app, sleeps
until the next run window, and calls the endpoint when triggered.

> **Not related to Cloudflare R2.** The app's R2 logo storage lives in the web app
> (`web/src/lib/r2.ts`) and has nothing to do with this worker.

## What it does
- Runs in an infinite loop: each cycle polls `GET {WEB_URL}/api/cron/staking` to fetch the configured schedule.
- If enabled, computes the next trigger time based on the schedule mode (INTERVAL or DAILY).
- At the next trigger time, calls `POST {WEB_URL}/api/cron/staking` with the `x-cron-secret` header.
- The web app pays each unpaid elapsed day (idempotent) and flips matured stakes to `MATURED`.
- On error (network, timeout, etc.), logs and retries next cycle—does not exit.

## Setup (Railway)

Railway builds this folder as a Node service and runs it as an always-on process.

1. Railway → **New service → GitHub repo** (this repo).
2. Service **Settings**:
   - **Root Directory:** `worker`
   - **Cron Schedule:** **Clear this field** (remove any cron expression). The service now loops internally instead.
   - **Start Command:** `node trigger.mjs` (set in `railway.json`).
   - **Deployment:** `restartPolicyType` is set to `ON_FAILURE` in `railway.json` so transient errors don't break the loop.
3. Service **Variables** — both required, or the script exits with an error at startup:
   - `WEB_URL` = `https://banawallet.com`
   - `CRON_SECRET` = **the same value** as the web app's `CRON_SECRET`.
     Tip: use a Railway reference (`${{shared.CRON_SECRET}}`) so the two can't drift apart.
4. Deploy, then check **Deploy Logs** for polling activity (requests to `GET /api/cron/staking`).

### The schedule now lives in Admin → Settings
The staking worker schedule is **no longer configured in Railway dashboard** — it lives in the web app at **Admin → Settings**, under "Staking worker schedule". Choose INTERVAL (e.g., every 5 minutes) or DAILY (e.g., 00:00 UTC), and toggle it on/off. The worker reads this config on each poll cycle and adjusts its timing accordingly.

## Troubleshooting

Since the worker is now always-on, **do not rely on Railway's "Last run" status** — that metric doesn't apply to a looping process. Instead, check the **Deploy Logs** for recurring errors or success patterns.

| Log pattern | Meaning | Action |
|---|---|---|
| Regular `200 {"ok":true,...}` at expected intervals | Working correctly. | None — all good. |
| `WEB_URL is not set` (startup, then exits) | Missing environment variable. | Add `WEB_URL` to Railway service Variables. |
| `CRON_SECRET is not set` (startup, then exits) | Missing environment variable. | Add `CRON_SECRET` to Railway service Variables. |
| Repeated `503 {"error":"CRON_SECRET not configured"}` | The **web app** does not have `CRON_SECRET` set. | Add `CRON_SECRET` to the web app's Railway Variables and redeploy it. |
| Repeated `401` errors | The two `CRON_SECRET` values don't match. | Verify both are identical (use Railway variable references to avoid drift). |
| No logs / no requests visible | Process may have crashed or not started. | Redeploy the worker service. Check Railway's container status (Deployments tab). |

Note: after changing `CRON_SECRET` on the **web app**, it must redeploy before the new value is live — requests before that completes still return 503.

## Notes
- Settlement is **idempotent** — running it often is safe (days are tracked by
  `daysPaid` + a unique `[positionId, dayIndex]`, so nothing is ever double-paid).
- The web app also computes accrual live on read, so the UI ticks up between runs;
  this worker credits the **real** payouts into the rewards ledger.
- Admins can also trigger the same settlement by hand: **Admin → Staking → "Run
  settlement now"** (identical logic, no worker involved).
