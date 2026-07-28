# BANA Wallet

A Nia-Hub B2B crypto wallet platform — multi-market deposits/withdrawals, balance lookup,
orders, trade history, and broker settlement. Built on **Next.js 15 (App Router) + React 19**,
with a secure server-side proxy to the Nia-Hub API (the HMAC secret never reaches the browser).

---

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 15 (App Router) + React 19 |
| Auth | Auth.js v5 (next-auth beta) — credentials + Google OIDC, role-based (`USER` / `ADMIN`) |
| Database | PostgreSQL via Prisma 7 (`@prisma/client` + `@prisma/adapter-pg`) |
| Email | Resend (password-reset emails) |
| Styling | Tailwind CSS v4, lucide-react, motion |
| AI | Google Gemini (`@google/genai`) |
| Deploy | Railway |

---

## Quick Start (Local)

**Prerequisites:** Node.js, a PostgreSQL database.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment — copy the example and fill in values
cp .env.example .env

# 3. Apply database migrations
npm run db:deploy

# 4. Seed the first admin user (reads ADMIN_EMAIL / ADMIN_PASSWORD from .env)
npm run db:seed

# 5. Run the dev server
npm run dev        # http://localhost:3000
```

---

## Local Development Setup (Detailed)

### Create a Local PostgreSQL Database

If you don't have a local PostgreSQL instance, create one:

```bash
# macOS (using Homebrew)
brew install postgresql
brew services start postgresql

# Linux (Ubuntu/Debian)
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql

# Create the local database and user
createuser -P bana          # (will prompt for password; you can use a simple one for dev)
createdb -O bana bana_wallet_dev

# Or if using "trust" auth (no password required locally):
sudo -u postgres createuser -d bana
sudo -u postgres createdb -O bana bana_wallet_dev
```

### Set Up `.env` — Method 1: Manual (Standalone)

If you're running standalone (no Railway CLI access), manually fill `.env`:

```bash
cp .env.example .env
```

Edit `web/.env` and set at minimum:

- `DATABASE_URL="postgresql://bana:PASSWORD@localhost:5432/bana_wallet_dev"` (or adjust to your local DB name/credentials)
- `AUTH_SECRET` — generate with `openssl rand -base64 32`
- `APP_URL="http://localhost:3000"`
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — used by `npm run db:seed`
- `NIA_API_KEY`, `NIA_API_SECRET`, `NIA_BROKER_ID` — obtain from Nia-Hub Broker Dashboard (required to run locally; use dummy values if testing auth only)

### Set Up `.env` — Method 2: From Railway (With Railway CLI)

If you have Railway CLI access and a Railway project linked:

```bash
# Install Railway CLI (if not already installed)
npm install -g @railway/cli

# Login to Railway and link the project
railway login
railway link <project-name>

# Pull all env vars from the Railway service
railway variables --service <service-name> --kv > web/.env.tmp

# Copy the output, then manually edit web/.env to override the DATABASE_URL:
# DATABASE_URL="postgresql://bana:PASSWORD@localhost:5432/bana_wallet_dev"
```

Then delete `web/.env.tmp` — you now have a `.env` file with all the Nia-Hub secrets and other config, but with a local database.

---

### Run Migrations & Seed

From the `web/` directory:

```bash
# Apply all pending migrations
npm run db:deploy

# Create the first admin user
npm run db:seed

# (Optional) Seed staking products for testing
npm run db:seed:staking
```

Then run the dev server:

```bash
npm run dev        # http://localhost:3000
```

---

## Environment Variables (`.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Auth.js session secret |
| `APP_URL` | Public base URL (used for password-reset links) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Bootstraps the first admin via `npm run db:seed` |
| `NIA_API_KEY` / `NIA_API_SECRET` | Nia-Hub broker credentials (server-only) |
| `NIA_BASE_URL` | Nia-Hub API host (default `https://api.niawallet.com`) |
| `NIA_HUB_URL` | Optional host override for the wallet-creation endpoint |
| `RESEND_API_KEY` / `EMAIL_FROM` | Resend email (required for "Forgot Password") |
| `GEMINI_API_KEY` | Google Gemini |

> Secrets live only on the server. Never commit `.env`.

---

## NPM Scripts

| Script | Action |
|---|---|
| `npm run dev` | Start dev server (port 3000) |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | Type-check (`tsc --noEmit`) |
| `npm run db:deploy` | Apply Prisma migrations |
| `npm run db:seed` | Seed the admin user |
| `npx vitest run` | Run the HMAC signing test harness |

---

## Roles & Access

- **USER** — wallet, deposit, withdraw, swap, staking, activity, settings.
- **ADMIN** — everything above plus the **/admin/settlement** broker area
  (unsettled commission, settlement history, tenant overview).

### Admin login

- **Admin email:** configured via `ADMIN_EMAIL` in `.env` (the seeded default is `admin@bana.test`).
- **Admin password:** set via `ADMIN_PASSWORD` in `.env` when you run `npm run db:seed`.
  > ⚠️ The password is **not** stored in this repo. Keep it in your own secrets manager /
  > password vault — never in version control.

### Managing / recovering a password

- **Change a known password:** sign in → **Settings → Security → Change password**.
- **Forgot password:** **Login → "Forgot password?"** → reset link is emailed (requires
  `RESEND_API_KEY` + a verified Resend domain).
- **Re-bootstrap the admin:** update `ADMIN_PASSWORD` in `.env` and re-run `npm run db:seed`.

---

## Project Structure

```
src/app/              Next.js App Router (layouts, pages, API route handlers)
src/app/(auth)/       Public auth shell — login, signup, forgot/reset password
src/app/(site)/       Authenticated user shell — portfolio, wallet, deposit, withdraw, swap, staking, activity, settings
src/app/admin/        ADMIN-only — settlement
src/app/api/nia/      Nia-Hub proxy route handlers (balance, deposits, withdrawals, address, orders, trades, markets, ...)
src/app/api/auth/     register, change-password, forgot-password, reset-password, [...nextauth]
src/lib/nia/          Server-only Nia-Hub client (HMAC + Bearer signing), config, state
src/lib/auth/         Session guards (requireUser / requireAdmin)
src/lib/email/        Resend email sender
src/components/       React UI components
prisma/               Schema, migrations, seed
messages/             i18n (en, ko, ja, zh, vi, th)
```

---

## Security Notes

- The Nia-Hub HMAC secret (`NIA_API_SECRET`) lives **only** in `src/lib/nia/*` (server-only) and is never sent to the browser.
- The browser only calls our own `/api/nia/*` routes — never Nia-Hub directly.
- Protected API routes enforce `requireUser()` / `requireAdmin()`; user identity is always derived from the session, never from client input.
- Passwords are hashed with `bcryptjs`. Never commit real credentials to the repo.
