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

## A verdict enum is not a display state — absence, staleness and vacuity are missing from every one

A checker model (`ReserveVerificationRun.result = PASS|FAIL|INCOMPLETE|QUERY_FAILED`) enumerates outcomes of runs that happened. The screen must additionally represent: no run exists at all, the checker worker is off, the latest run is older than N intervals, and — the one that is always forgotten — the run passed **vacuously** because both sides of the inequality were zero (e.g. a proof-of-reserve with zero registered addresses and zero issued claims). All four render green if the spec maps `result` straight to a chip. Derive the display state server-side from `result` + `latestRun === null` + `workerEnabled` + `isStale` + a vacuity predicate, fix a precedence order in the spec, and forbid the pass colour on every state that is not a real pass. Worked form: `docs/specs/staking-yield-system-v2-design-a8-admin-dashboard-frd.md` §6.1.

## When an architecture change re-partitions liability, re-check which figure still means "discharged"

The old admin liability screen was built on `unpaidInterest` vs `hubSettled` — correct only because no payout rail existed. Under the local-ledger model, claiming moves interest from the unclaimed-interest ledger into the user's local balance: both remain claims on the same treasury, so liability does not drop by one unit. Porting the old two-column framing would have taught operators that claims pay down debt. Before reusing an existing money screen's axis after a model change, name the single event that actually removes a row from the liability side (here: the on-chain-verified debit) and make the headline the *total*, with everything else as its internal decomposition — otherwise a bucket transfer reads as a payment.

## Reading the upstream design docs in order is how you find the arithmetic that stopped matching

A-3 answered "is staked principal deducted or soft-locked?" with *soft-locked* (holds never change `balance`) while copying rev02's reserve inequality verbatim — which adds staked principal to the sum of local balances that already contains it. Neither document is wrong alone. When a spec inherits a formula from doc N and a semantics decision from doc N+1, restate the formula in terms of the new semantics before designing anything on top of it. If it does not survive, do not silently fix it (invariants belong to `pm`) and do not call over-counting "conservative" — an invariant that breaches daily gets switched off, which is the same failure mode the two-stage detection rule (`X-3′`) was created to avoid. Escalate it, and design the data contract (per-component `role: ADDITIVE | SUBSET_OF_X`) so the screen renders correctly under either resolution and an AC fails loudly if the server's total disagrees with its own components.

## Severity tiers on an admin screen are a design decision, not a formatting one

`X-3′` split hub-listing detection (warning, user functions untouched) from hub-balance detection (fail-closed) precisely because one over-firing guard teaches operators to disable it. That reasoning does not stop at the code layer: putting the warning tier into the same non-dismissible red banner as the real breach re-merges what the upstream doc deliberately split, and the red banner becomes routine. Spec two distinct components with distinct colours and distinct vocabulary (an AC that forbids "violation" in the warning copy and "warning" in the breach copy), and make the incident list server-produced with an explicit `code` — plus a rendering for codes the client does not recognise, or the next incident added ships invisible.

## "Hide it when off" and "never hide it" are usually about two different objects

rev05 AC-13 required the admin-credit menu entry not to render while the kill switch is off; the same round required the issued amount to stay visible. Read as one axis these contradict, and whichever you pick you violate the other. They are two objects: the **action entry point** (hide — an affordance that cannot succeed reads as "system error" when pressed, which is why the grant form was pulled in CS-1′) and the **money already created** (never hide — it is a fact independent of the switch). Split them explicitly, and add the third case nobody names: the page reached by a direct URL/bookmark. A `404` or redirect there asserts "this feature does not exist", which is false — render the page with an honest `DISABLED` state and no form fields at all. Worked form: `docs/specs/staking-yield-system-v2-design-t16-admin-credit-frd.md` §3.4.

## A typing confirmation implemented as exact string equality destroys the control it was added for

The friction exists so the operator re-reads *who* and *how much*. Exact-match rejection of `100.00` vs `100`, or `Admin@X.com` vs `admin@x.com`, reads as a broken field — and the operator's next move is to copy the value out of the form, which is precisely the behaviour the confirmation was designed to prevent. Spec the comparison semantics (decimal equality for amounts, trim+lowercase for emails), block paste in those fields *and say so on screen* (blocking silently reads as a bug), keep the placeholder from containing the answer, and require the server to re-compare — a disabled client button is not a control. Also name what typing does **not** catch: a wrong *direction* (credit vs debit) types identically, so that needs a distinct colour, a distinct verb, and the direction in the modal title.

## The biggest double-issue path on a money-writing admin screen is the retry after an ambiguous failure

Not privilege abuse — a timeout after commit, where the screen never said what happened and the operator presses again. If the ledger already carries a `(coin, idempotencyKey)` unique constraint (`LocalLedgerEntry` does), an issuing screen that does not use it has left the guard on the floor. Spec: the key is generated once when the confirmation modal opens and reused by every retry from that modal; the route checks it *after* taking its serialization lock but *before* the limit checks — the other order makes a successful credit's replay render as "limit exceeded". And forbid "nothing was issued" copy on unrecognised error codes: the screen does not know that. The honest line is "outcome unknown — check the ledger; retrying from this screen will not issue twice".

## Three limits with three different scopes need scope labels, not just numbers

`adminCreditMaxPerTx` / `MaxPerDay` / `CumulativeCap` differ in *what they range over* — this one transaction, me over a rolling 24h, this coin across all admins net of debits — not merely in size. Listed as three rows of numbers, an operator reads the 24h usage as platform-wide and the cumulative as their own. Put the scope in the row as its own labelled column. Two riders: a rolling window has **no reset instant**, so forbid "resets at midnight/tomorrow" copy and say capacity returns as old entries age out; and a *net* cumulative figure can go **down** (a recovery debit), so label it "net", never "issued" — a figure named "issued" that decreases reads as a bug.
