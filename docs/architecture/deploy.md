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
Railway builds with Nixpacks (`npm install` → `npm run build`) and starts with `npm run
start` (`next start`) — **no migration step runs on boot.** `web/railway.json` (which
previously chained `npm run db:deploy && npm run start`) was removed 2026-08-07
(commit `cc51773`); this is now the intended design, not a gap — auto-migrating on every
restart was judged riskier than a deliberate, manual migration step.

Production schema changes ship via `prisma-db-expert` running `prisma migrate deploy`
**manually**, from a local machine, against Railway's public Postgres proxy URL:
```
(set -a && source .env.production.local && set +a && npx prisma migrate deploy)
```
run from `web/`. `web/.env.production.local` (gitignored) holds the production
`DATABASE_URL` — Railway's `DATABASE_PUBLIC_URL` (public TCP proxy, e.g.
`*.proxy.rlwy.net:<port>`), not the internal `*.railway.internal` one, since the internal
hostname only resolves between services inside the Railway project. Only `deploy-manager`
may fetch/refresh that value (`railway variables`, scoped to the Postgres service) — this
is a read of an existing secret, not a change, so it's distinct from the env-var-change
ban below; it still goes through the Railway CLI ask-gate since `variables` isn't on the
read-only allowlist. **Never `prisma db push`** on the production database (CLAUDE.md
rule 7).

### Schema sync is an invariant, not a periodic chore (CLAUDE.md rule 7)
Because production doesn't auto-migrate, local and production schema can only drift if
`prisma-db-expert` lets a local migration sit undeployed. The rule: deploy every local
migration to production in the same session it was created, and check `migrate status`
against both before starting new schema work — never let a backlog accumulate.

Checking sync (read-only, safe to run anytime):
```
npx prisma migrate status                                                   # local
(set -a && source .env.production.local && set +a && npx prisma migrate status)  # prod
```
"Database schema is up to date!" on both = in sync. If production lists pending
migrations, that's drift — `prisma-db-expert` reports what each pending migration does
(additive vs. destructive, money-bearing columns touched or not) and deploys only once
the user approves. Incident precedent: on 2026-08-10, 4 migrations
(`add_staking_payout_user_paidat_index`, `staking_auto_renew`,
`staking_auto_renew_r7_backfill_decision`, `staking_auto_renew_status_values`) had
accumulated undeployed on production before this invariant was written down — all
additive/safe, deployed after user approval, since resolved.

## First-admin seed (one-time per environment)
`railway run npm run db:seed` (or the equivalent one-off command in the Railway service
shell). Upserts `ADMIN_EMAIL` as an ADMIN user. Do **not** add this to the start command —
it would reset the admin password on every restart. Note this also resets the account's
password to `ADMIN_PASSWORD` — for promoting an *existing* account without touching its
password, use the production data change flow below instead.

## Production data changes (non-schema)
For one-off data fixes on an existing row (e.g. promoting `admin@admin.com` to `role:
'ADMIN'` without resetting its password) — not a migration, not a Railway `env`/service
change:
1. `deploy-manager` fetches/refreshes `DATABASE_PUBLIC_URL` into `web/.env.production.local`
   (same read-only relay used for migrations — see § Deploy + migrate above).
2. `prisma-db-expert` connects with that file and runs the change directly (Prisma Client
   query or `psql` via
   `(set -a && source .env.production.local && set +a && ...)`), after stating the exact
   command and getting explicit user approval — same gate as `migrate deploy`.
`deploy-manager` never executes the data change itself; its Railway scope stays limited to
redeploy/restart/log/status/connection-string-fetch (CLAUDE.md rule 6).

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

## Pre-push account verification (mandatory before `git push`)

**This is NOT just a git config check.** `git config user.name` and `git config user.email`
control commit authorship metadata, but `git push` authentication is separate and is driven by
your **active GitHub CLI account** (if using HTTPS credential helper via `gh`).

**Incident:** 2026-08-09, `deploy-manager` committed staking page redesign with correct
author metadata (`git config user.name/email = banaglobal81`) but push failed with HTTP 403.
Root cause: `gh` had 3 accounts logged in (`linetrader`, `mentor7lee-ai`, `banaglobal81`),
and the active account was `linetrader`. Git's HTTPS credential helper used the active account's
token, rejecting the push to a repository owned by `banaglobal81`. Resolution: `gh auth switch
--hostname github.com --user banaglobal81` fixed it.

**Procedure (mandatory before every `git push`):**

1. **Identify the intended repository owner:**
   ```bash
   git remote -v
   ```
   Look for the origin URL — it should say `github.com/<expected-account>/Bana_Wallet`.
   For production BANA, this must be `banaglobal81`.

2. **Check your active GitHub CLI account (if using HTTPS via `gh`):**
   ```bash
   gh auth status
   ```
   This shows which account is currently active for `api.github.com` and `github.com`.
   If using SSH keys, this step is less critical, but still verify.

3. **If active account ≠ repository owner: switch.**
   ```bash
   gh auth switch --hostname github.com --user <correct-account>
   ```
   For BANA production, this would be:
   ```bash
   gh auth switch --hostname github.com --user banaglobal81
   ```

4. **Re-verify — run `gh auth status` again and confirm the new account is active.**

5. **Now proceed with `git push`.**

**Key point:** Even if `git config user.name` is correct, if the active GitHub account doesn't
have permission to push to the repository, the push will be rejected with HTTP 403. This check
must run **before every push**, not once at setup.

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
