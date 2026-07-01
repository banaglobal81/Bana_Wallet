# BANA Staking Worker

A tiny **Cloudflare Worker** with a **Cron Trigger** that runs the daily staking
interest accrual. It does **not** touch the database — it calls a secret-protected
endpoint on the web app (`POST /api/cron/staking`), which owns the DB and the
accrual logic. This keeps one source of truth and avoids duplicating DB setup.

## What it does
- Fires on the cron schedule in `wrangler.toml` (default: `0 0 * * *` — daily at 00:00 UTC).
- Calls `POST {WEB_URL}/api/cron/staking` with the `x-cron-secret` header.
- The web app recomputes each active stake's accrued interest (idempotent) and
  flips matured stakes to `MATURED`.

## Setup
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
