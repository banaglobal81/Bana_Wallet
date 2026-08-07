# Railway Deploy Reference

> Referenced from `deploy-manager.md`. Read this when the task is provisioning a Railway
> environment, checking why a deploy/migration failed, or re-verifying prod after a push —
> not force-loaded into every agent's context. Account identity (which Railway login/project,
> which git identity) is separate — see `deploy-manager.local.md` (gitignored).

## Topology
Single **Next.js 15** process backed by **PostgreSQL** (Prisma 7). `web/railway.json`
wires the migrate + start steps.
```
Bana_Wallet/
├── web/      ← the Next.js app (Railway service Root Directory = `web/`) — app code + .env live here
└── worker/   ← Railway always-on service (staking settlement) — deployed separately, see worker.md
```
The `.env` file lives in **`web/.env`**, not the repo root. Never commit it — git-ignored by design.

## Service setup (one-time, already done for the live `Banawallet` project)
1. Railway project → Deploy from GitHub repo → this repo, branch `main`.
2. Service Root Directory = `web/` (Settings → Root Directory).
3. Same project → **+ New → Database → Add PostgreSQL**.
4. On the app service → Variables: `DATABASE_URL = ${{Postgres.DATABASE_URL}}`.

## Required environment variables
| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `APP_URL` | the Railway service URL, e.g. `https://bana.up.railway.app` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | first admin login (strong password) |
| `NIA_API_KEY` / `NIA_API_SECRET` / `NIA_BROKER_ID` | from Nia-Hub broker dashboard |
| `NIA_BASE_URL` | `https://api.niawallet.com` |

Optional: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (Google login), `RESEND_API_KEY` /
`EMAIL_FROM` (password-reset email), `GEMINI_API_KEY` (AI). Full list: `web/.env.example`.
Secret **values** are supplied by the project owner directly in Railway — never sourced
from or written into this repo.

## Deploy + migrate
Railway builds with Nixpacks (`npm install` → `npm run build`) and starts with the
`railway.json` command: `npm run db:deploy && npm run start`.
`db:deploy` runs `prisma migrate deploy` (idempotent, safe on every start) — creates all
tables from `web/prisma/migrations/` on a fresh database. **Never `prisma db push`** on
the production database (CLAUDE.md rule 7).

## First-admin seed (one-time per environment)
`railway run npm run db:seed` (or the equivalent one-off command in the Railway service
shell). Upserts `ADMIN_EMAIL` as an ADMIN user. Do **not** add this to the start command —
it would reset the admin password on every restart.

## Google OAuth redirect (only if Google login is enabled)
Google Cloud Console → Credentials → authorized redirect URI:
`https://<railway-domain>/api/auth/callback/google`

## Operating constraints
- **Keep replicas = 1.** In-memory state (webhook event buffer, nonce dedup) — horizontal
  scaling needs Redis first. `railway.json` sets `numReplicas: 1`.
- Node 20 pinned via `.nvmrc`.

## Post-deploy verification
1. App URL → login page loads.
2. Log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` → Admin Console reachable.
3. **Deposit** → selecting a coin/network returns a real address (confirms Nia-Hub
   credentials work).

## Ongoing Railway operations (`deploy-manager`)
Scope: status/log queries (autonomous) and redeploy/restart triggers (**user confirmation
required first** — see `deploy-manager.md` § Railway control). Env var/secret changes and
service creation/deletion are never in scope here, confirmed or not.

- Status: `railway status`
- Logs: `railway logs` (add `--deployment` for a specific past deployment if the current
  one looks fine but a prior failure is being diagnosed)
- Redeploy latest commit / restart the service: check `railway --help` and
  `railway <subcommand> --help` for the exact current verb (CLI surface changes between
  Railway CLI versions — confirm before running rather than assume a remembered flag).
  Always run from the project linked to **Banawallet / production** — verify with
  `railway status` first if there's any doubt which project/service context is active.
- After a redeploy, re-run the Post-deploy verification checklist above before reporting
  success.
