# CLAUDE.md — BANA Wallet Platform

> This file is the **global ruleset** auto-loaded into every agent's context.
> Each agent file (`.claude/agents/*.md`) inherits these rules and cannot violate them.

## Project Overview

- **Description:** BANA — a Nia-Hub B2B crypto wallet platform. Multi-market deposits/withdrawals, balance lookup, orders, trade history, settlement.
- **Actual tech stack:**
  - Frontend: **Vite 6 + React 19** (`src/`, `src/components/`, `src/utils/`)
  - Backend: **Express `server.js`** — Nia-Hub HMAC signing proxy (holds the secret)
  - Styling: TailwindCSS v4 (`@tailwindcss/vite`), lucide-react, motion
  - Deploy: Railway
- **Nia-Hub integration:** two HMAC signing schemes coexist in `server.js`.
  - **Trading API:** headers `X-Nia-Tenant-Key` / `X-Nia-Signature` / `X-Nia-Timestamp` / `X-Nia-Nonce`, payload = `timestamp + nonce + METHOD + path + (bodyString | queryString)`
  - **Wallet/Settlement API:** headers `X-Api-Key` / `X-Timestamp` / `X-Nonce` / `X-Signature`, payload = `timestamp + nonce + METHOD + /full/path?query + body`, nonce = UUID v4, timestamp tolerance ±60s
- **Data flow:** `Browser (React) → /api/nia/* (Express server.js) → Nia-Hub`. The secret lives **only in `server.js`** and is never exposed to the browser.

> Note: this project is **not** a Next.js/Prisma/Flutter monorepo. Some agents (`mobile-expert`, `prisma-db-expert`) stay **dormant** until that stack is introduced.

## Code Tree

```
src/                  — React 19 app (App.tsx, main.tsx, types.ts, mockData.ts)
src/components/        — wallet UI components (Wallet, Dashboard, Deposit, Withdraw, Swap, Staking, ...)
src/utils/            — frontend client (niaApi.ts), clipboard.ts
server.js             — Express backend proxy (two HMAC schemes, /api/nia/*)
server/core/          — (harness) extracted pure logic
server/infra/         — (harness) real-dependency adapters (fetch/express)
tests/harness/        — harness tests (mocks/fixtures)
start.sh / stop.sh    — local up/down (Vite :3000 + Express :8787)
```

## Absolute Rules

1. **Respond in English.** (Code, logs, and error messages may stay in their original language; explanations are in English.)
2. **Use `decimal.js` only for amounts/quantities.** Do **not** use `Number()` / `parseFloat()` / `+string` for money arithmetic. (Nia-Hub returns balances/amounts as strings.)
   - Scope: new/modified code must comply immediately. Existing violations are flagged by `code-compliance-checker` and replaced incrementally.
3. **No direct Nia-Hub calls from the browser.** The frontend must only call `src/utils/niaApi.ts` → `/api/nia/*` (Express). No direct fetch to `api.niawallet.com`.
4. **The HMAC secret (`NIA_API_SECRET`) lives only in `server.js`.** Never leak the secret into the client bundle, logs, or error responses. The two signing schemes in `server.js` are **owned by `web-shared-expert`**.
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

- **The React/Vite frontend is harness-exempt** → E2E (Playwright) only.
- **`server.js` (backend) is the primary harness target.** Extract pure logic (HMAC signing, payload canonicalization, query cleaning, envelope unwrap) into `server/core/`, and keep real dependencies (fetch/express) in `server/infra/`.
- 3-step workflow: (1) define mocks/inputs/expectations in `tests/harness/<feature>/` → (2) split `core` (pure) / `infra` (real deps) → (3) submit harness logs + diff → commit after `qa-lead` approval.
- Test runner: **vitest** (`npx vitest run`).
