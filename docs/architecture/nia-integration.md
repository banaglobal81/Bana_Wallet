# Nia-Hub Integration

> Referenced from `CLAUDE.md` → Docs Index. Primary readers: `web-shared-expert`
> (owns this layer), `wallet-security-expert` (reviews diffs against it).

## Two HMAC signing schemes (plain concatenation, no newlines)

- **Trading API:** headers `X-Nia-Tenant-Key` / `X-Nia-Signature` / `X-Nia-Timestamp` / `X-Nia-Nonce`, payload = `timestamp + nonce + METHOD + path + (bodyString | queryString)` (plain concat)
- **Wallet/Settlement API:** headers `X-Api-Key` / `X-Timestamp` / `X-Nonce` / `X-Signature`, payload = `timestamp + nonce + METHOD + /full/path?query + body` (plain concat), nonce = UUID v4, timestamp tolerance ±60s

Live-verified: plain concatenation = HTTP 200; newline-joined payload = HTTP 401 "Invalid Signature". Do not reintroduce newline-joined payloads.

## Implementation

- Pure signing logic: `web/server/core/nia-signing.js` (reusable, harness-tested in `web/tests/harness/nia-signing/`)
- Next.js-specific wrapper (env, request handling): `web/src/lib/nia/client.ts` (`niaRequest` / `niaWalletRequest`)
- `NIA_API_SECRET` never leaves `web/src/lib/nia/*` (server-only) — see CLAUDE.md rule 4.

## Route handlers (13, `web/src/app/api/nia/**/route.ts`)

`address`, `balance`, `deposits`, `withdrawals`, `transfer`, `orders`, `trades`, `markets`, `klines`, `wallet-history`, `notifications`, `status`, `webhook`.

Each exports `runtime='nodejs'` + `dynamic='force-dynamic'`. Adding a new Hub endpoint: create a route handler here, use `niaRequest` / `niaWalletRequest` from `web/src/lib/nia/client.ts`.

## Data flow

`Browser (React) → /api/nia/* (Next.js route handlers) → Nia-Hub`. The frontend only calls `web/src/utils/niaApi.ts` (relative `/api/nia/*` fetches) — never `api.niawallet.com` directly (CLAUDE.md rule 3).
