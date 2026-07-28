# CLAUDE.md — BANA Wallet Platform

> This file is the **global ruleset** auto-loaded into every agent's context.
> Each agent file (`.claude/agents/*.md`) inherits these rules and cannot violate them.
> **Kept intentionally lean for token cost.** Detailed architecture reference lives under
> `docs/architecture/` and is read on demand by the agents that need it — it is NOT
> force-loaded here. See [Docs Index](#docs-index). When this file's detail sections start
> regrowing past a paragraph or two, move the detail out to `docs/architecture/` instead of
> inlining it — `sync-harness-docs.sh` warns if this file exceeds ~90 lines.

## Project Overview
- **Description:** BANA — a Nia-Hub B2B crypto wallet platform. Multi-market deposits/withdrawals, balance lookup, orders, trade history, settlement.
- **Repo layout:** monorepo. `web/` is the Next.js app (everything below unless noted). `worker/` is a separate Railway cron service — details in `docs/architecture/worker.md`.
- **Tech stack:** Next.js 15 App Router + React 19, Auth.js v5 (credentials + `bcryptjs`, roles `USER`/`ADMIN`), PostgreSQL via Prisma 7, `@google/genai` (Gemini), TailwindCSS v4, `next-intl` i18n (en/ko/ja/zh/vi/th, every page lives under `web/src/app/[locale]/`), deployed on Railway. Full path-by-path breakdown: `docs/architecture/code-tree.md`.
- **Nia-Hub integration:** two HMAC signing schemes (plain concatenation, no newlines) — Trading API and Wallet/Settlement API. Exact headers/payload format/endpoint list: `docs/architecture/nia-integration.md`.
- **Data flow:** `Browser (React) → /api/nia/* (Next.js route handlers) → Nia-Hub`. The secret `NIA_API_SECRET` lives **only in `web/src/lib/nia/` (server-only)** and is never exposed to the client.

## Absolute Rules

1. **Match the master's input language.** If the user (master) writes in Korean, respond/explain in Korean; otherwise respond in English. (Code, logs, and error messages may stay in their original language regardless of which language the explanation is in.)
2. **Use `decimal.js` only for amounts/quantities.** Do **not** use `Number()` / `parseFloat()` / `+string` for money arithmetic. (Nia-Hub returns balances/amounts as strings.)
   - Scope: new/modified code must comply immediately. Existing violations are flagged by `code-compliance-checker` and replaced incrementally.
3. **No direct Nia-Hub calls from the browser.** The frontend must only call `web/src/utils/niaApi.ts` → `/api/nia/*` (Next.js route handlers). No direct fetch to `api.niawallet.com`.
4. **The HMAC secret (`NIA_API_SECRET`) lives only in `web/src/lib/nia/*` (server-only).** Never leak the secret into the client bundle, logs, or error responses. The two signing schemes (implemented in `web/src/lib/nia/client.ts` + `web/server/core/nia-signing.js`) are **owned by `web-shared-expert`**.
5. **Git commits are `deploy-manager` only.** No history rewrites (`git rebase` / `reset --hard`).
6. **`git push` to `main` is `deploy-manager`-only.** No other agent may push. `deploy-manager` pushes autonomously after commit (no per-push user confirmation required). No force-push, ever.
7. **`prisma db push` is absolutely forbidden** (all agents). The DB + Prisma is now live — all schema changes go through migrations only (`prisma migrate dev` / `prisma migrate deploy`). Never run `prisma migrate reset` or drop tables on a shared/production DB.
8. **Authentication is mandatory on protected routes.** API route handlers serving user/admin data must call `requireUser()` / `requireAdmin()` from `web/src/lib/auth/session.ts`. Never trust a client-supplied user id for authorization — derive it from the session. Passwords are hashed with `bcryptjs`; never store or log plaintext passwords.
9. **Model tiers are role-based, not uniform — this is a token-cost control, not a formality.** `opus` is reserved for planning/spec-design work only (`pm`, `product-planner`). Every other agent runs on `sonnet` or `haiku` per the Model Tier Strategy table below, chosen by task complexity, not defaulted to `sonnet`. Changing an agent's tier means editing **both** this table **and** that agent's `.claude/agents/*.md` frontmatter `model:` field in the same change — `sync-harness-docs.sh` flags a mismatch.
10. **Keep this file atomized.** `CLAUDE.md` holds rules + tables only. Anything descriptive/detailed (path lists, wire-format specs, workflow prose) belongs in `docs/architecture/*.md`, read on demand by the agents whose scope needs it — not force-loaded into every agent's context. `doc-keeper` enforces this on request.

## Model Tier Strategy

| Tier | Model  | Trigger |
|------|--------|---------|
| T1   | haiku  | `tsc --noEmit`, lint, grep, log/build checks, git commit + deploy-status checks, templated Tailwind/design-token work, dormant-agent stubs |
| T2   | sonnet | code read/edit across wallet/admin/shared/DB layers, custody security review, QA scenario design, growth/retention analysis |
| T3   | opus   | product planning & spec design only — PRDs, FRDs, feature/screen design |

## Agent Team (16)

| # | Agent | model | Scope | Status |
|---|-------|-------|-------|--------|
| 1 | web-wallet-expert | sonnet | wallet UI components | active |
| 2 | web-admin-expert | sonnet | admin & settlement views | active |
| 3 | web-shared-expert | sonnet | shared layer + owns HMAC client | active |
| 4 | mobile-expert | haiku | Flutter mobile | **dormant** |
| 5 | wallet-security-expert | sonnet | security review only (no code edits) | active |
| 6 | prisma-db-expert | sonnet | DB & migrations (User/auth schema, Postgres) | active |
| 7 | ui-ux-designer | haiku | Tailwind & design tokens | active |
| 8 | pm | opus | product planning & PRD | active |
| 9 | product-planner | opus | FRD & screen specs | active |
| 10 | growth-pm | sonnet | growth & retention | active |
| 11 | qa-lead | sonnet | QA | active |
| 12 | deploy-manager | haiku | git commit + push + Railway | active |
| 13 | routine-tasks | haiku | tsc/lint/grep/build | active |
| 14 | code-compliance-checker | haiku | rule-violation detection | active |
| 15 | doc-keeper | haiku | doc sync | active |
| 16 | researcher | sonnet | external web research → `docs/research/` | active |

## Docs Index

Read on demand — not auto-loaded into every agent's context. Read the one your task's scope actually touches.

- `docs/architecture/code-tree.md` — full path-by-path breakdown of `web/src`, `web/prisma`, etc.
- `docs/architecture/nia-integration.md` — Nia-Hub HMAC signing schemes, exact headers/payload concatenation, route handler list
- `docs/architecture/harness.md` — harness engineering principles, 3-step workflow, vitest wiring
- `docs/architecture/worker.md` — `worker/` cron service (staking settlement)
