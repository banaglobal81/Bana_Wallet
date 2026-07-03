# BANA Staking Worker

A tiny daily cron that runs the staking interest settlement. It does **not** touch
the database — it calls a secret-protected endpoint on the web app
(`POST /api/cron/staking`), which owns the DB and the accrual logic. One source of
truth, no duplicated DB setup.

Run it on **Railway** (`trigger.mjs`, Node) **or** **Cloudflare** (`src/index.ts`,
wrangler) — pick one.

## What it does
- Fires daily (`0 0 * * *`).
- Calls `POST {WEB_URL}/api/cron/staking` with the `x-cron-secret` header.
- The web app pays each unpaid elapsed day (idempotent) and flips matured stakes to `MATURED`.

## Deploy option A — Railway (recommended if you already use Railway)

Railway builds this folder as a Node service and runs it on a **Cron Schedule**.
The entry is `trigger.mjs` (plain Node `fetch`, zero deps) — it calls the endpoint
once and exits.

1. Railway → **New service → GitHub repo** (this repo).
2. Service **Settings**:
   - **Root Directory:** `worker`
   - **Cron Schedule:** `0 0 * * *`  ← **required.** Without it the service runs
     continuously, and since the script exits, Railway will restart it in a loop.
3. Service **Variables**:
   - `WEB_URL` = `https://banawallet.com`
   - `CRON_SECRET` = **the same value** as the web app's `CRON_SECRET`.
4. Deploy. Railway runs `npm start` (→ `node trigger.mjs`) daily; check **Deploy Logs**
   for `[staking-cron] 200 {...}`.

> The Railway build was failing because `package.json` had **no `start` script**, so
> the builder couldn't produce a runnable image. Fixed: `start` → `node trigger.mjs`.

## Deploy option B — Cloudflare Worker

Uses the native cron trigger in `src/index.ts` + `wrangler.toml`.

### Setup
1. Install deps (in this `worker/` folder):
   ```
   npm install
   ```
2. Set the web app URL in `wrangler.toml`:
   ```toml
   [vars]
   WEB_URL = "https://your-deployed-web-app"
   ```
3. Set the shared secret (must equal the web app's `CRON_SECRET`):
   ```
   wrangler secret put CRON_SECRET
   ```
   Generate one with `openssl rand -hex 32` and set the **same value** in the web
   app's `.env` (`CRON_SECRET=...`).
4. Deploy:
   ```
   npm run deploy
   ```

## Test it
- Run locally: `npm run dev`, then open the printed URL (the `fetch` handler runs
  the accrual once and prints the result).
- Trigger the cron locally: `wrangler dev --test-scheduled` then
  `curl "http://localhost:8787/__scheduled?cron=0+0+*+*+*"`.
- Manually in production: `GET` the worker URL (the `fetch` handler runs accrual once).

## Notes
- Accrual is **idempotent** — running it multiple times a day is safe (it recomputes
  the correct total, never double-counts).
- The web app also computes accrual live on read, so the UI is always correct even
  between worker runs; this worker keeps the **stored** `accruedInterest` up to date
  (used for reporting and, later, payout).
