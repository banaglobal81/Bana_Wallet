# Wallet Platform Harness Engineering + Agent Setup Bootstrap

> **How to use**: From the wallet project root, run `claude` and paste the entire prompt below.
> After generation, replace the Railway project name/account and brand name with the real values.

---

## Bootstrap prompt

```
Generate the CLAUDE.md and all .claude/agents/ agent files for a new wallet platform project.

## Project overview
- Description: a crypto custodial wallet platform — multi-chain deposits/withdrawals, balance lookup, transaction history
- Tech stack: **Next.js 15 App Router + React 19, single Node server (no Prisma/Flutter/Redis in the current phase)**, deployed on Railway
- Hub integration: NiaHub HMAC API — Trading/Wallet two schemes, plain concatenation (no newline)
- Hub API URL: env var NIA_HUB_INTERNAL_URL
- No API Gateway (Express/Fastify): hub calls are handled directly server-side in Next.js Route Handlers (src/lib/nia/*)

## Code tree (current BANA structure)
- src/app/           — Next.js 15 App Router (wallet UI + admin portal)
- src/lib/nia/       — server-only NiaHub API layer (HMAC signing, state singleton)
- src/app/api/nia/   — 14 route handlers (replaces Express server.js)
- server/core/       — Pure signing logic (harness target)
- tests/harness/     — vitest tests

## CLAUDE.md absolute rules (include all)
- Response language: always English (code/logs/errors may stay in their original language; explanations in English)
- Amounts/quantities use decimal.js only — no Number() / parseFloat
- Encrypted columns use AES-256-GCM (env var CRED_ENC_KEY_B64)
- No direct hub calls from the browser/app — must go through the Next.js server side
- Prisma migrations (migrate dev / migrate deploy) are prisma-db-expert only, run from the apps/web/ directory
- db push absolutely forbidden (all agents)
- Git history operations (commit / push / rebase / reset --hard) are deploy-manager only
- No direct SQL changes to the production DB — read-only SELECT is free

## Model tier strategy
| Tier | Model  | Trigger                                          |
|------|--------|--------------------------------------------------|
| T1   | haiku  | tsc, grep, log scans, flutter analyze, Prisma generate |
| T2   | sonnet | single-area code read/edit, UI, schema, workers  |
| T3   | opus   | custody security, HMAC review, balance precision, unclear-root-cause bugs |

## Agent team (15 — each created as a .md file under .claude/agents/)

Each file format:
---
name: <name>
description: <one-line summary, used by Claude Code for auto-selection>
tools: Read, Edit, Write, Bash, Grep, Glob  (adjusted per agent)
model: sonnet | haiku | opus
---

> Global rules reference: CLAUDE.md (project root, auto-loaded into context)

You are [role description]...

### 1. web-wallet-expert (sonnet)
Scope: main wallet UI — balance lookup, deposit address generation, withdrawal requests, transaction history, chain selection, withdrawal-limit display
Files: under src/app (wallet routes) + src/components
Hub calls: must go through Route Handlers / server-side (no direct calls from client components)

### 2. web-admin-expert (sonnet)
Scope: admin portal — user management, KYC (sumsub) review, withdrawal-limit/whitelist config, chain/address config, banners
Files: under the admin routes

### 3. web-shared-expert (sonnet)
Scope: shared layer — auth config, the hub HMAC client (server-side only, in src/lib/nia/*), shared state, UI kit, i18n
Important: this agent owns the hub HMAC client (there is no Fastify API Gateway, so it is managed here)
HMAC signing logic: timestamp + nonce + method + fullPath + rawBody → HMAC-SHA256 (plain concatenation)

### 4. mobile-expert (sonnet)
Scope: Flutter 3.11+, Riverpod, GoRouter, flutter_secure_storage, fingerprint/PIN auth, deposit/withdraw UI

### 5. wallet-security-expert (opus)
Scope: review only (never edits code) — custody key management, withdrawal signing logic, HMAC security, balance-precision diff review
How it's called: receives only the diff written by a sonnet agent → reviews → approve/reject verdict

### 6. prisma-db-expert (sonnet)
Scope: Prisma schema & migrations
Example models: Wallet, Transaction, Address, Chain, User, KYC, ReferralEdge, ApiKey (AES-256-GCM)
Schema-change procedure: edit apps/web/prisma/schema/ → migrate dev (local) → migrate deploy (each production DB) → prisma generate across all apps
Holds full migrate dev / migrate deploy authority. db push absolutely forbidden.

### 7. ui-ux-designer (sonnet)
Scope: TailwindCSS v4 + design tokens, wallet UI layout, per-chain icons/colors, i18n support, Flutter theme
State/logic stays with the owning web agent

### 8. pm (sonnet)
Scope: wallet product planning — new chains/tokens, deposit/withdrawal limit policy, events/promotions, KYC-level design, PRDs (docs/specs/)
Never writes code directly. Before any substantive change, must create temp/<YYYYMMDD-HHMMSS>/ (changes.md + status.md)

### 9. product-planner (sonnet)
Scope: detailed feature specs (FRD), screen design, flows, edge cases, error-message definitions — turns the pm's Why into an implementable How

### 10. growth-pm (sonnet)
Scope: onboarding optimization, retention KPIs, deposit conversion, referral program, event calendar

### 11. qa-lead (sonnet)
Scope: wallet QA
Key scenarios:
- deposit address generation → deposit detection → balance update (per-chain confirmation counts)
- withdrawal precision errors (decimal.js verification), withdrawal-limit-exceeded / KYC-insufficient rejection
- per-chain address format validation (EVM / TRON / BTC, etc.)
- HMAC bypass, session hijack, nonce reuse prevention
- concurrent withdrawal race conditions (prevent double-deduction of balance)
- hub balance vs local cache mismatch detection
Flow: npm run dev → test (npx vitest run) → (on pass) call deploy-manager
After tests, delete test-results/ immediately (avoid disk accumulation)

### 12. deploy-manager (sonnet)
Scope: git add → commit → Railway deploy-status check & report
Authority: git add, git commit only — git push is user-only (never pushes)
Railway CLI auth: run `source ~/.zshrc && railway whoami` first
Railway project info: [replace with the real project name/account]

### 13. routine-tasks (haiku)
Scope: tsc, log scans, grep, Prisma generate, flutter analyze, lint/format, dependency checks
The main Claude delegates to this agent instead of running Bash directly

### 14. code-compliance-checker (haiku)
Scope: detect CLAUDE.md rule violations (non-decimal.js math, db push traces, direct hub calls, etc.), doc-vs-code drift

### 15. doc-keeper (haiku)
Scope: auto-sync docs after code changes — detect & fix drift in case counts, ports, paths, agent declarations

## Harness Engineering

Principles: Test-Harness First · Encapsulation · Observability · Validation

3-step agent workflow:
1. Create tests/harness/<feature>/ — define Mocks (DB, hub API, Redis), inputs, expectations
2. Split src/core/ (pure logic) + src/infra/ (real dependencies); extract dependency-injection interfaces
3. Submit harness run logs + diff → commit after qa-lead approval

Directory structure:
apps/[app]/src/{core/, infra/, index.ts}
apps/[app]/tests/harness/{mocks/, fixtures/, [feature].test.ts}

Exceptions:
- the Next.js web app — harness-exempt, E2E (Playwright) only
- apps/mobile/ — test/harness/ (singular, unlike other apps' plural tests/)

## Self-Update Protocol (append to the end of every agent file)

### Self-Update Protocol

This agent may edit this file directly via the Edit tool under the conditions below.

Allowed:
- add a new pattern to the ## Pattern Library section
- update factual info such as case counts, paths, numbers
- add a new item to the prohibitions list (existing items may not be deleted/modified)

Forbidden:
- changing the role (description)
- changing trigger conditions
- any edit that widens the allowed/forbidden boundary itself

Required after editing:
1. record the change in this project's memory
2. run `bash $(git rev-parse --show-toplevel)/sync-harness-docs.sh` to sync doc drift

## Additional files to generate

Also generate:

1. sync-harness-docs.sh — script that auto-detects + fixes drift in agent .md case counts/ports/paths (with execute permission)
2. .claude/settings.json — Bash allowed-command whitelist (npm, npx next, git read-only, etc.)

## Post-generation checklist

- CLAUDE.md exists + includes the agent-team table
- 15 .md files exist under .claude/agents/
- each agent has --- frontmatter (name/description/tools/model)
- pm.md includes the temp creation procedure (changes.md + status.md)
- qa-lead.md includes the npm run dev → test → deploy-manager flow
- web-shared-expert.md states ownership of the hub HMAC client
- wallet-security-expert.md states "never edits code, diff-review only"
- every agent includes a Self-Update Protocol section
- every agent includes cross-area / prohibitions / sub-delegation sections
```
