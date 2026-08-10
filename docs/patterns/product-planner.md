# Pattern Library — product-planner

Read on demand by `product-planner` only, when the current task's scope overlaps an entry below. See `CLAUDE.md` § Agent Self-Update Protocol for edit rules.

## Staking: the principal is soft-locked, never moved

Staking performs no fund transfer. `available(coin) = niaBalance(coin) − Σ principal of ACTIVE positions` — implemented in `web/src/app/api/staking/stake/route.ts`, `web/src/lib/staking.ts` (`lockedPrincipalByCoin`), and `web/src/components/Staking.tsx`. "Returning the principal at maturity" is therefore not an event; it is the absence of a subtraction once `status` leaves `ACTIVE`.

Consequence for any spec touching maturity: an operation that ends one position and starts another with the same principal is a **pure DB operation** and can be made atomic in one transaction with no external call. Do not spec a hub balance re-check for it — the locked total is unchanged, so the invariant is preserved by arithmetic.

## Staking interest is a ledger, not a balance

`runStakingSettlement` writes `StakingPayout` rows and `paidInterest`; nothing anywhere credits interest into the Nia wallet. Real payout is Phase 2, unbuilt, pending an answer from Nia (`docs/specs/staking-and-coins-plan.md` §7 Q1). Any feature that proposes to *use* accrued interest (compounding, reinvesting, spending) is specifying against a balance that does not exist. Verify before writing "principal only" as a policy — it is currently a mechanical constraint.

## Check whether a proposed mechanism satisfies the target metric *definitionally*

Before sizing feature A against feature B on a shared metric, check whether either one increments the metric's numerator by construction rather than by persuading a user. If it does, the comparison is an artefact and the metric must be split (e.g. by a provenance field on the created row) before either ships. Also check the other feature's **guardrails** for the same collision — a mechanism can breach a guardrail belonging to a feature it was never meant to interact with, if both run in the same measurement window.
