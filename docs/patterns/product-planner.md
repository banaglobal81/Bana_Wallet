# Pattern Library — product-planner

Read on demand by `product-planner` only, when the current task's scope overlaps an entry below. See `CLAUDE.md` § Agent Self-Update Protocol for edit rules.

## Staking: the principal is soft-locked, never moved

Staking performs no fund transfer. `available(coin) = niaBalance(coin) − Σ principal of ACTIVE positions` — implemented in `web/src/app/api/staking/stake/route.ts`, `web/src/lib/staking.ts` (`lockedPrincipalByCoin`), and `web/src/components/Staking.tsx`. "Returning the principal at maturity" is therefore not an event; it is the absence of a subtraction once `status` leaves `ACTIVE`.

Consequence for any spec touching maturity: an operation that ends one position and starts another with the same principal is a **pure DB operation** and can be made atomic in one transaction with no external call. Do not spec a hub balance re-check for it — the locked total is unchanged, so the invariant is preserved by arithmetic.

## Staking interest is a ledger, not a balance

`runStakingSettlement` writes `StakingPayout` rows and `paidInterest`; nothing anywhere credits interest into the Nia wallet. Real payout is Phase 2, unbuilt, pending an answer from Nia (`docs/specs/staking-and-coins-plan.md` §7 Q1). Any feature that proposes to *use* accrued interest (compounding, reinvesting, spending) is specifying against a balance that does not exist. Verify before writing "principal only" as a policy — it is currently a mechanical constraint.

## Check whether a proposed mechanism satisfies the target metric *definitionally*

Before sizing feature A against feature B on a shared metric, check whether either one increments the metric's numerator by construction rather than by persuading a user. If it does, the comparison is an artefact and the metric must be split (e.g. by a provenance field on the created row) before either ships. Also check the other feature's **guardrails** for the same collision — a mechanism can breach a guardrail belonging to a feature it was never meant to interact with, if both run in the same measurement window.

## On a money screen, "failed to load" and "zero" must not render the same

`.catch(() => [])` plus a `list.length > 0 &&` render gate is the standard shape in this repo's admin pages (`admin/staking/page.tsx:69`, `admin/dashboard/page.tsx:32`). On a liability/balance surface it collapses three distinct states — loading, fetch failure, genuinely zero — into one blank region, and the operator reads the blank as zero. Any spec that puts a financial figure on screen must name all three states separately and forbid rendering `0` during the first two. `docs/specs/admin-staking-debt-visibility-frd.md` §5.4 is the worked form.

## A number that is constant by absence of code needs a falsifiability guard, not a hardcoded literal

When the honest value of a field is zero *because the code path that would make it non-zero does not exist* (e.g. `hubSettled` while no payout rail exists), do not let the implementer inline `0` in the component. Spec it as (a) a constant produced by the API, next to (b) a discriminant the UI keys its copy off, and (c) a query over whatever observable would break the claim (here: `COUNT(*) WHERE status='PAID'`, a status nothing in the codebase assigns). Otherwise the screen keeps asserting the zero after the assumption stops holding, and the assumption's expiry is invisible. See `docs/specs/admin-staking-debt-visibility-frd.md` §3.3–3.4.

## Splitting a misleading aggregate: delete the old field name, don't alias it

When a wire field's name is itself the defect (`totalPaid` for money never paid), check the consumer count before reaching for a back-compat alias. Two consumers that ship in the same change is not a migration problem — and leaving the honest-looking old name in the response guarantees the next feature reads it. Make its absence a grep-able acceptance criterion, and put a one-line "do not reintroduce this name" note at the query site, since the name reappearing *was* the original failure path.

## A disabled button and an unavailable state are two different claims

A disabled primary action tells the user "the condition is yours to satisfy." Spec it only when that is true (amount is zero, minimum not met). When the blocker is a rail that does not exist, a kill switch, or maintenance, the same disabled button silently promises that waiting or topping up will unlock it. Spec a non-button status chip instead and enumerate the renderings explicitly (`UNAVAILABLE` / `DISABLED` / `ENABLED`) with the discriminant each keys off — otherwise the implementer collapses them into one `disabled={...}` expression. Never delete the action slot entirely either: its presence is what tells the user the money is not in their wallet yet. Worked form: `docs/specs/staking-page-v2-screen-flow-frd.md` §3.3 / §4.2.3.

## Before speccing a 6-locale copy fix, verify the string is actually an i18n key

`Staking.tsx:387,396` rendered "Rewards Earned" / "Paid to date" as hardcoded English inside JSX, so the inherited requirement "correct this copy in all six locales" was unachievable as written — there was no key to correct. Grep the offending string in `web/messages/en.json` before writing the requirement; if it is absent, the deliverable is *keying it* plus translating, which changes the owner and the estimate. The same check applies to any inherited requirement phrased as "reword X" — a reword task and a first-time-internationalize task look identical in a spec and are not the same job.

## Moving a list into a sheet breaks scroll-anchor cross-navigation

This repo's canvas ↔ list linking is built on `document.getElementById('position-<id>').scrollIntoView()` plus a matching `id=` on the row. That pattern dies silently the moment either side moves into a modal/bottom sheet: the target is unmounted, so the call is a no-op with no error. Any IA change that relocates a linked list must respec both directions as explicit state (open-sheet-then-highlight one way, a `focusWellId`-style prop the other) and name the new prop as a handoff item — otherwise the bidirectional requirement survives in prose while dying in code.

## Deriving a lock/limit figure client-side survives only until the server rule changes

`Staking.tsx` recomputes locked principal by summing every ACTIVE position. That matched the server while the server did the same thing. The moment a spec narrows the server rule (e.g. excluding `PLATFORM_GRANT` principal from the withdrawal lock), the client's copy becomes wrong in the user's disfavour and nothing fails loudly. When a spec changes the definition of a number the client also computes, make "the server returns this figure, from the same function the enforcing route uses" an explicit data-contract requirement plus an AC — do not treat the duplication as an implementation detail.
