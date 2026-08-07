# Worker

> Referenced from `CLAUDE.md` → Docs Index.

`worker/` — a separate, zero-dependency Railway always-on process (`worker/trigger.mjs`). It does **not** touch the DB directly; it polls `GET {WEB_URL}/api/cron/staking` (secret-protected via `CRON_SECRET`) to read the configured schedule, and calls `POST {WEB_URL}/api/cron/staking` when triggered, which owns the DB and the accrual logic. One source of truth, no duplicated DB setup.

- Deployed on Railway as a **normal always-on service** (Root Directory: `worker`, Start Command: `node trigger.mjs`). It runs in an infinite loop internally — no Railway Cron Schedule needed.
- The **schedule** (enabled/disabled, interval or daily mode, times) is configurable from **Admin → Settings** (`web/src/app/[locale]/admin/settings/page.tsx`) and stored in `PlatformSetting` (DB). The worker reads it on each cycle.
- Required Railway variables: `WEB_URL`, `CRON_SECRET` (must match the `web/` app's value).
- Settlement is idempotent — safe to run often (`daysPaid` + unique `[positionId, dayIndex]`, never double-paid).
- Full details, schedule modes, troubleshooting: `worker/README.md`.
