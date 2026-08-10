# Pattern Library — web-wallet-expert

Read on demand by `web-wallet-expert` only, when the current task's scope overlaps an entry below. See `CLAUDE.md` § Agent Self-Update Protocol for edit rules.

## Staking page v2 (DEEP CORE-centric, PS-A) — 2026-08-10

- **`DeepCoreEmbed` bundles B1 (canvas/HUD) and B4 (control bar) into one
  returned tree by design** (game-developer's own comment there: "the ONE
  insertion point ... everything else ... lives inside this tree"). A screen
  IA doc that lists B1/B2/B3/B4/B5 as five stacked blocks with B2/B3 between
  B1 and B4 cannot be achieved literally without editing `deep-core/**`
  (off-limits). Render `<DeepCoreEmbed/>` once, put B2/B3/B5 after it, and
  disclose the ordering deviation rather than silently reordering or
  reaching into the forbidden directory.
- **Server-computed aggregates (locked principal, ledgered yield, etc.) must
  ship as a sibling field on an existing response**, not a new endpoint —
  check for an existing helper first (`lockedPrincipalByCoin` in
  `web/src/lib/staking.ts` was already the withdrawal route's own lock
  calculation; reusing it for the positions-route response is what actually
  fixes a "client recompute drifted from server" bug, not just moving where
  the sum happens).
- **When a redesign changes what "recorded interest" means (ledgered vs.
  live-computed), check `web/e2e/*.spec.ts` and `web/e2e/global-setup.ts`
  fixtures before assuming the old assertions still hold** — a fixture that
  seeds `paidInterest: '0'` was backing an assertion for a *client-computed*
  live accrual value that the redesign intentionally removes; the old
  assertion (a nonzero "accrued" number) becomes actively wrong once the
  page switches to showing the server ledger value.
- Stable error codes for a route with only a raw English message: add a
  `code` (and, only for the few messages that need one, a small `params`
  object) to every existing error response in place — no new route, no
  schema change — then map `code → staking.error.<code>` client-side. Keep
  the English `error` string in the body for logs only; never render it.
