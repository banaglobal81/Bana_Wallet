# CLAUDE.md — BANA Wallet Platform

> This file is the **global ruleset** auto-loaded into every agent's context.
> Each agent file (`.claude/agents/*.md`) inherits these rules and cannot violate them.

## Project Overview

- **Description:** BANA — a Nia-Hub B2B crypto wallet platform. Multi-market deposits/withdrawals, balance lookup, orders, trade history, settlement.
- **Actual tech stack:**
  - Framework: **Next.js 15 App Router + React 19** (`src/app/`, `src/components/`, `src/lib/`)
  - Server: **Single Node process** — Next.js route handlers (`src/app/api/**/route.ts`). HMAC signing lives in `src/lib/nia/client.ts` (server-only).
  - Auth: **Auth.js v5 (next-auth beta)** — credentials provider, `bcryptjs` password hashing, role-based access (`USER` / `ADMIN`). Config in `src/auth.ts` + `src/auth.config.ts`; route protection in `src/middleware.ts`; server-side guards in `src/lib/auth/session.ts` (`requireUser` / `requireAdmin`).
  - Database: **PostgreSQL via Prisma 7** (`@prisma/client` + `@prisma/adapter-pg` + `pg`). Schema in `prisma/schema.prisma`; connection URL in `prisma.config.ts` (`env("DATABASE_URL")` — Prisma 7 no longer allows `url` in the datasource block). Migrations in `prisma/migrations/`, seed in `prisma/seed.ts`.
  - AI: **`@google/genai`** (Gemini) — `GEMINI_API_KEY`.
  - Styling: TailwindCSS v4, lucide-react, motion
  - Deploy: Railway (one server, can scale horizontally but in-memory state requires single replica or Redis)
- **Nia-Hub integration:** two HMAC signing schemes (plain concatenation, no newlines).
  - **Trading API:** headers `X-Nia-Tenant-Key` / `X-Nia-Signature` / `X-Nia-Timestamp` / `X-Nia-Nonce`, payload = `timestamp + nonce + METHOD + path + (bodyString | queryString)` (plain concat)
  - **Wallet/Settlement API:** headers `X-Api-Key` / `X-Timestamp` / `X-Nonce` / `X-Signature`, payload = `timestamp + nonce + METHOD + /full/path?query + body` (plain concat), nonce = UUID v4, timestamp tolerance ±60s
- **Data flow:** `Browser (React) → /api/nia/* (Next.js route handlers) → Nia-Hub`. The secret `NIA_API_SECRET` lives **only in `src/lib/nia/` (server-only)** and is never exposed to the client.

## Code Tree

```
src/app/              — Next.js 15 App Router. layout.tsx (root), page.tsx, globals.css
src/app/(auth)/       — public auth shell. layout.tsx, login/page.tsx, signup/page.tsx
src/app/(site)/       — authenticated user shell. layout.tsx (Sidebar, Notifications, ProfileMenu), {portfolio,swap,staking,wallet,deposit,withdraw,settings,activity}/page.tsx
src/app/admin/        — ADMIN-only area. layout.tsx (role guard), settlement/page.tsx
src/app/api/nia/      — Nia-Hub route handlers (balance, deposits, withdrawals, transfer, orders, trades, markets, klines, wallet-history, notifications, status, webhook)
src/app/api/admin/    — settlement/{unsettled,history}/route.ts (ADMIN-only)
src/app/api/auth/     — register/route.ts (sign-up), [...nextauth]/route.ts (Auth.js login/session)
src/auth.ts           — Auth.js v5 instance (handlers, auth, signIn, signOut)
src/auth.config.ts    — Auth.js config (providers, callbacks, pages)
src/middleware.ts     — route protection (redirects unauthenticated → /login, gates /admin)
src/lib/auth/session.ts — server-only guards: requireUser() (401), requireAdmin() (403)
src/lib/nia/          — server-only Nia-Hub API layer. config.ts, state.ts (globalThis singleton), client.ts (niaRequest/niaWalletRequest), resolve.ts, respond.ts. All marked `import 'server-only'`.
src/components/       — React 19 components ('use client' where needed). Wallet, Dashboard, Deposit, Withdraw, Swap, Staking, ActivityHistory, Notifications, Sidebar, ProfileMenu, etc.
src/types/            — next-auth.d.ts (session/role type augmentation)
src/utils/            — frontend client (niaApi.ts fetches /api/nia/*, relative URLs), clipboard.ts
prisma/               — schema.prisma (User, Role enum), migrations/, seed.ts
prisma.config.ts      — Prisma 7 config; datasource.url = env("DATABASE_URL")
server/core/nia-signing.js   — pure HMAC signing logic (reusable, harness-tested)
tests/harness/        — vitest harness tests (nia-signing/*)
package.json          — scripts: dev (next dev -p 3000), build, start, lint (tsc --noEmit), db:migrate (prisma migrate dev), db:deploy (prisma migrate deploy), db:seed (tsx prisma/seed.ts), postinstall (prisma generate)
```

## Absolute Rules

1. **Respond in English.** (Code, logs, and error messages may stay in their original language; explanations are in English.)
2. **Use `decimal.js` only for amounts/quantities.** Do **not** use `Number()` / `parseFloat()` / `+string` for money arithmetic. (Nia-Hub returns balances/amounts as strings.)
   - Scope: new/modified code must comply immediately. Existing violations are flagged by `code-compliance-checker` and replaced incrementally.
3. **No direct Nia-Hub calls from the browser.** The frontend must only call `src/utils/niaApi.ts` → `/api/nia/*` (Next.js route handlers). No direct fetch to `api.niawallet.com`.
4. **The HMAC secret (`NIA_API_SECRET`) lives only in `src/lib/nia/*` (server-only).** Never leak the secret into the client bundle, logs, or error responses. The two signing schemes (implemented in `src/lib/nia/client.ts` + `server/core/nia-signing.js`) are **owned by `web-shared-expert`**.
5. **Git commits are `deploy-manager` only.** No history rewrites (`git rebase` / `reset --hard`).
6. **`git push` is user-only — every agent (including `deploy-manager`) is forbidden from pushing.** Agents stop after `git add` + `git commit` and hand push off to the user.
7. **No direct edits to production secrets (.env).** Read-only checks (whether config is set) only. Never commit `.env`. Secrets now also include `DATABASE_URL`, `AUTH_SECRET`, and `GEMINI_API_KEY`.
8. **`prisma db push` is absolutely forbidden** (all agents). The DB + Prisma is now live — all schema changes go through migrations only (`prisma migrate dev` / `prisma migrate deploy`). Never run `prisma migrate reset` or drop tables on a shared/production DB.
9. **Authentication is mandatory on protected routes.** API route handlers serving user/admin data must call `requireUser()` / `requireAdmin()` from `src/lib/auth/session.ts`. Never trust a client-supplied user id for authorization — derive it from the session. Passwords are hashed with `bcryptjs`; never store or log plaintext passwords.

## Model Tier Strategy

| Tier | Model  | Trigger |
|------|--------|---------|
| T1   | haiku  | `tsc --noEmit`, `npm run lint`, grep, log scans, build checks, dependency checks |
| T2   | sonnet | single-area code read/edit, UI, components, proxy routes, workers |
| T3   | opus   | custody security, HMAC signing review, balance/withdrawal precision, unclear-root-cause bugs |

## Agent Team (15)

| # | Agent | model | Scope | Status |
|---|-------|-------|-------|--------|
| 1 | web-wallet-expert | sonnet | wallet UI components | active |
| 2 | web-admin-expert | sonnet | admin & settlement views | active |
| 3 | web-shared-expert | sonnet | shared layer + owns HMAC client | active |
| 4 | mobile-expert | sonnet | Flutter mobile | **dormant** |
| 5 | wallet-security-expert | opus | security review only (no code edits) | active |
| 6 | prisma-db-expert | sonnet | DB & migrations (User/auth schema, Postgres) | active |
| 7 | ui-ux-designer | sonnet | Tailwind & design tokens | active |
| 8 | pm | sonnet | product planning & PRD | active |
| 9 | product-planner | sonnet | FRD & screen specs | active |
| 10 | growth-pm | sonnet | growth & retention | active |
| 11 | qa-lead | sonnet | QA | active |
| 12 | deploy-manager | sonnet | git commit + Railway (no push) | active |
| 13 | routine-tasks | haiku | tsc/lint/grep/build | active |
| 14 | code-compliance-checker | haiku | rule-violation detection | active |
| 15 | doc-keeper | haiku | doc sync | active |

## Harness Engineering Principles

**Test-Harness First · Encapsulation · Observability · Validation**

- **The React frontend (`src/app/` / `src/components/`) is harness-exempt** → E2E (Playwright) only.
- **`src/lib/nia/client.ts` + `server/core/nia-signing.js` are the primary harness targets.** Pure signing logic lives in `server/core/nia-signing.js` (reusable), and `src/lib/nia/client.ts` wraps it with Next.js-specific context (environment, request handling). Real dependencies (fetch, next/server) stay server-only.
- 3-step workflow: (1) define mocks/inputs/expectations in `tests/harness/<feature>/` → (2) keep `core` pure, integration in `src/lib/nia/*` → (3) submit harness logs + diff → commit after `qa-lead` approval.
- Test runner: **vitest** (`npx vitest run`).
