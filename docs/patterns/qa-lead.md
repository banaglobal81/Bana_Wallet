# Pattern Library — qa-lead

Read on demand by `qa-lead` only, when the current task's scope overlaps an entry below. See `CLAUDE.md` § Agent Self-Update Protocol for edit rules.

## Real local-DB integration verification (no mocks) via a scratch vitest file

For acceptance criteria that need a genuine Postgres round-trip (advisory locks,
row locks, real transactions — e.g. concurrent-stake race conditions), a
mocked unit test can't prove it. Pattern that works in this repo:

- `web/src/lib/*.ts` files start with `import 'server-only'`, which throws
  outside Next's build. `web/vitest.config.ts` already aliases `server-only`
  to a no-op stub — so a **vitest** test file (not a bare `tsx`/`node`
  script) can import real `@/lib/*` modules and hit the real DB, as long as
  you don't mock `@/lib/db`.
- `web/.env`'s `DATABASE_URL` isn't loaded by vitest automatically. Run it as:
  `node --env-file=.env node_modules/vitest/vitest.mjs run src/lib/__qa_scratch.test.ts`
  (from `web/`). Confirm you're on the local DB first (`node --env-file=.env
  -e "console.log(process.env.DATABASE_URL)"`, redacting the password before
  printing) — never point this pattern at a `DATABASE_PUBLIC_URL`/prod string.
- Name the scratch file `__qa_*.test.ts` under `web/src/lib/`, delete it when
  done — it is never committed.
- **This local dev DB has `STAKING_DAY_MS=300000`** (a 5-minute staking day,
  for demo purposes — see `stakingMath.ts`'s doc comment). Any QA script that
  computes maturity/settlement offsets MUST import `stakingDayMs()` from
  `@/lib/stakingMath` and use it for every date-math offset — a hardcoded
  `24*60*60*1000` "days later" is actually ~288x further in staking-days than
  intended and will blow straight through a position's term.
- Cleanup must be robust against a mid-test assertion failure (which skips
  that test's own inline cleanup code, since it never reaches it). Don't key
  cleanup on in-memory ids collected during the run — sweep by a fixed
  marker instead (e.g. `WHERE email LIKE 'qa-<task>-%'` / a fixed admin
  email for `AuditLog`), run the sweep in **both** a defensive `beforeAll`
  (in case a previous crashed run never got to its own `afterAll`) and the
  real `afterAll`. `afterAll` at the top level of a vitest file always runs
  once after every `it()` in that file, pass or fail — verified empirically:
  a first pass at this pattern without the marker-based sweep left an
  orphaned `LocalBalanceHold` (ACTIVE, no matching position) in the local
  dev DB after a test threw mid-assertion; the email-prefix sweep + rerun
  cleaned it up. Always re-query the DB after the run to confirm the
  pre-existing baseline (row counts, `PlatformSetting`, `ManagedCoin`
  authority stage) is bit-for-bit what it was before you started.
- Temporarily relaxing shared mutable state (`PlatformSetting.maxInterestLiabilityCapBana`,
  `ManagedCoin.authorityAlertStage`) must be wrapped in `try/finally` per
  test, not just restored at the end of the file — otherwise one failing
  assertion mid-test leaves e.g. `authorityAlertStage=T2_HALTED` in place for
  every later test in the same run.
