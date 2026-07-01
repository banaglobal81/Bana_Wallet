# Deploying BANA Wallet to Railway

This app is a single **Next.js 15** process backed by **PostgreSQL** (Prisma 7).
The repo is deploy-ready: production build passes, migrations are committed, and
`web/railway.json` wires the migrate + start steps. The deployer only needs to create
the Railway services and set the environment variables.

## Repo layout (monorepo)
```
bana-self-custody-system/
├── web/      ← the Next.js app (build/deploy this)  ← all app code + .env live here
└── worker/   ← Cloudflare Worker (daily staking-accrual cron) — deployed separately
```
**On Railway, set the service's Root Directory to `web/`** so it builds the app.
The `.env` file lives in **`web/.env`** (not the repo root).

---

## 1. Create the services
1. New Railway project → **Deploy from GitHub repo** → select this repo, branch `main`.
2. **Set the service Root Directory to `web/`** (Settings → Root Directory).
3. In the same project: **+ New → Database → Add PostgreSQL**.

## 2. Connect the database
On the **app service → Variables**, set:
```
DATABASE_URL = ${{Postgres.DATABASE_URL}}
```
(That references the Postgres plugin — no manual connection string needed.)

## 3. Set the environment variables
On the **app service → Variables**, add everything from [`.env.example`](.env.example).
Required minimum to boot and log in:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `APP_URL` | the Railway service URL, e.g. `https://bana.up.railway.app` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | the first admin login (strong password) |
| `NIA_API_KEY` / `NIA_API_SECRET` / `NIA_BROKER_ID` | from Nia-Hub broker dashboard |
| `NIA_BASE_URL` | `https://api.niawallet.com` |

Optional (enable the matching feature): `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
(Google login), `RESEND_API_KEY` / `EMAIL_FROM` (password-reset email),
`GEMINI_API_KEY` (AI). The secret **values** are supplied separately by the project
owner — they are git-ignored and not in this repo.

## 4. Deploy
Railway builds with Nixpacks (`npm install` → `npm run build`) and starts with the
command in `railway.json`:
```
npm run db:deploy && npm run start
```
`db:deploy` runs `prisma migrate deploy`, which creates all tables from
`prisma/migrations/` on the fresh database. It is idempotent — safe on every start.

## 5. Seed the first admin (run once)
After the first successful deploy, create the admin account. Either:
- **Railway CLI:** `railway run npm run db:seed`, or
- a one-off command in the Railway service shell: `npm run db:seed`.

This upserts `ADMIN_EMAIL` as an ADMIN user. Do **not** add it to the start command
(it would reset the admin password on every restart).

## 6. Google OAuth (only if Google login is enabled)
In Google Cloud Console → Credentials, add the authorized redirect URI:
```
https://<your-railway-domain>/api/auth/callback/google
```

---

## Important notes
- **Keep replicas = 1.** There is in-memory state (webhook event buffer, nonce
  dedup). Horizontal scaling requires Redis first. `railway.json` sets `numReplicas: 1`.
- **Migrations only — never `prisma db push`** on the production database.
- **Never commit `.env`** or real secrets. They are git-ignored by design.
- Node 20 is pinned via `.nvmrc`.

## Verify after deploy
1. Open the app URL → the login page loads.
2. Log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` → **Admin Console** is reachable.
3. Open **Deposit** → selecting a coin/network returns a real address (confirms the
   Nia-Hub credentials work).
