# CLAUDE.md — BANA Wallet Platform

> This file is the **global ruleset** auto-loaded into every agent's context.
> Each agent file (`.claude/agents/*.md`) inherits these rules and cannot violate them.

## Project Overview

- **Description:** BANA — a Nia-Hub B2B crypto wallet platform. Multi-market deposits/withdrawals, balance lookup, orders, trade history, settlement.
- **Actual tech stack:**
  - Framework: **Next.js 15 App Router + React 19** (`src/app/`, `src/components/`, `src/lib/nia/`)
  - Server: **Single Node process** — 14 Next.js route handlers (`src/app/api/nia/**/route.ts`). HMAC signing lives in `src/lib/nia/client.ts` (server-only).
  - Styling: TailwindCSS v4, lucide-react, motion
  - Deploy: Railway (one server, can scale horizontally but in-memory state requires single replica or Redis)
- **Nia-Hub integration:** two HMAC signing schemes (plain concatenation, no newlines).
  - **Trading API:** headers `X-Nia-Tenant-Key` / `X-Nia-Signature` / `X-Nia-Timestamp` / `X-Nia-Nonce`, payload = `timestamp + nonce + METHOD + path + (bodyString | queryString)` (plain concat)
  - **Wallet/Settlement API:** headers `X-Api-Key` / `X-Timestamp` / `X-Nonce` / `X-Signature`, payload = `timestamp + nonce + METHOD + /full/path?query + body` (plain concat), nonce = UUID v4, timestamp tolerance ±60s
- **Data flow:** `Browser (React) → /api/nia/* (Next.js route handlers) → Nia-Hub`. The secret `NIA_API_SECRET` lives **only in `src/lib/nia/` (server-only)** and is never exposed to the client.

## Code Tree

```
src/app/              — Next.js 15 App Router. layout.tsx (root), providers.tsx (Context), page.tsx (redirect → /portfolio), globals.css
src/app/api/nia/      — 14 route handlers (balances, deposits, withdrawals, orders, settlement, etc.)
src/app/(app)/        — authenticated shell. layout.tsx (Sidebar, Notifications, ProfileMenu), template.tsx, {portfolio,swap,staking,wallet,deposit,withdraw,settings,activity}/page.tsx
src/components/       — React 19 components ('use client' where needed). Wallet, Dashboard, Deposit, Withdraw, Swap, Staking, ActivityHistory, Notifications, etc.
src/lib/nia/          — server-only Nia-Hub API layer. config.ts, state.ts (globalThis singleton), client.ts (niaRequest/niaWalletRequest), resolve.ts, respond.ts. All marked `import 'server-only'`.
src/utils/            — frontend client (niaApi.ts fetches /api/nia/*, relative URLs), clipboard.ts
server/core/nia-signing.js   — pure HMAC signing logic (reusable, harness-tested)
tests/harness/        — vitest harness tests (nia-signing/*)
package.json          — scripts: npm run dev (next dev -p 3000), npm run build, npm start, npm run lint (tsc --noEmit)
```

## Absolute Rules

1. **Respond in English.** (Code, logs, and error messages may stay in their original language; explanations are in English.)
2. **Use `decimal.js` only for amounts/quantities.** Do **not** use `Number()` / `parseFloat()` / `+string` for money arithmetic. (Nia-Hub returns balances/amounts as strings.)
   - Scope: new/modified code must comply immediately. Existing violations are flagged by `code-compliance-checker` and replaced incrementally.
3. **No direct Nia-Hub calls from the browser.** The frontend must only call `src/utils/niaApi.ts` → `/api/nia/*` (Next.js route handlers). No direct fetch to `api.niawallet.com`.
4. **The HMAC secret (`NIA_API_SECRET`) lives only in `src/lib/nia/*` (server-only).** Never leak the secret into the client bundle, logs, or error responses. The two signing schemes (implemented in `src/lib/nia/client.ts` + `server/core/nia-signing.js`) are **owned by `web-shared-expert`**.
5. **Git commits are `deploy-manager` only.** No history rewrites (`git rebase` / `reset --hard`).
6. **`git push` is user-only — every agent (including `deploy-manager`) is forbidden from pushing.** Agents stop after `git add` + `git commit` and hand push off to the user.
7. **No direct edits to production secrets (.env).** Read-only checks (whether config is set) only. Never commit `.env`.
8. **If/when a DB + Prisma is introduced, `db push` is absolutely forbidden** (all agents). Schema changes go through migrations only.

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
| 6 | prisma-db-expert | sonnet | DB & migrations | **dormant** |
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
