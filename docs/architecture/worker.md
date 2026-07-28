# Worker

> Referenced from `CLAUDE.md` → Docs Index.

`worker/` — a separate, zero-dependency Railway cron service (`worker/trigger.mjs`). It does **not** touch the DB directly; it calls `POST {WEB_URL}/api/cron/staking` on the `web/` app (secret-protected via `CRON_SECRET`), which owns the DB and the accrual logic. One source of truth, no duplicated DB setup.

- Deployed on Railway as a **Cron Schedule** service (Root Directory: `worker`, Start Command: `node trigger.mjs`). The schedule itself lives in Railway settings, not in this repo.
- Required Railway variables: `WEB_URL`, `CRON_SECRET` (must match the `web/` app's value).
- Settlement is idempotent — safe to run often (`daysPaid` + unique `[positionId, dayIndex]`, never double-paid).
- Full details, troubleshooting table: `worker/README.md`.
