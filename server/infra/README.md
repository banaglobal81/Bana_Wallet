# server/infra/

The real-dependency adapter layer (harness separation). Paired with `server/core/` (pure logic).

What belongs here:
- `fetch` call wrappers (Nia-Hub HTTP)
- Injection points for non-deterministic sources like `crypto.randomUUID()` / `Date.now()`
- Wiring Express handlers to the core functions

**Principle:** pure logic (sign-string building, normalization) lives in `server/core/`; only side effects (time, randomness, network) are handled here. Harness tests verify `core` deterministically and replace `infra` with mocks.

> `server.js` currently runs as a single file. Extract it into `core`/`infra` incrementally — the first extraction target is `server/core/nia-signing.js` (done).
