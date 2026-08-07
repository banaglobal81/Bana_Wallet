# Pattern Library — web-shared-expert

Read on demand by `web-shared-expert` only, when the current task's scope overlaps an entry below. See `CLAUDE.md` § Agent Self-Update Protocol for edit rules.

### Next.js 15 App Router structure (live as of 2026-06-17)
- **Lib layer lives in `web/src/lib/nia/`**: config.ts, state.ts, client.ts, resolve.ts, respond.ts, identity.ts — all marked `import 'server-only'` at the top.
- **Pure signing helpers imported from `web/server/core/nia-signing.js`** (reuse, not re-implement). Import with `.js` extension since it is a real JS file; TypeScript-to-TypeScript imports within `web/src/lib/nia/` use no extension.
- **`server-only` package** must be in `dependencies` (not devDependencies); install with `npm install server-only`.
- **Route handler boilerplate**: every `web/src/app/api/nia/**/route.ts` exports `export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';` at the top. POST/DELETE parse body with `try { body = await req.json() } catch { body = {}; }`.
- **Wallet signing is PLAIN concat** (no newlines): `${ts}${nonce}${METHOD}${fullPath}${body}` — live-verified. Do NOT use newline-separated format.
- **Dedup guard in withdrawals** (`web/src/app/api/nia/withdrawals/route.ts`): uses `niaState.inFlightWithdrawals` (Set on the globalThis singleton). Key is `idem:${clientKey}` if `Idempotency-Key` header present, else `${userId}|${currency}|${network}|${toAddress.trim()}|${decAmount.toFixed()}`. Returns 409 on collision.
- **`resolveUserId`** does NOT fall back to `NIA_DEFAULT_USER_ID` in the withdrawals handler — explicit userId is required (400 if absent).
- **Safe error shape**: `{ ok:false, error: e.message, code?: e.data?.code }` — raw `e.data` is never forwarded.
- **`globalThis` singleton pattern for state**: `const g = globalThis as unknown as { __niaState?: NiaState }; export const niaState = g.__niaState ?? (g.__niaState = { ... });` — survives dev hot-reload.
- **Railway deployment caveat**: in-memory withdrawal dedup + webhook event store are per-process. **Pin Railway to a SINGLE replica** (or use Redis for multi-replica scaling).
