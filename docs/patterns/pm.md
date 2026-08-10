# Pattern Library — pm

Read on demand by `pm` only, when the current task's scope overlaps an entry below. See `CLAUDE.md` § Agent Self-Update Protocol for edit rules.

## Ruling on another agent's spec: verify the load-bearing claim in code

*Learned 2026-08-08, ruling on `docs/specs/oil-drilling-staking-game-frd.md`.*

When a spec's approval hinges on a claim like "this performs no writes / needs no new
tables / is provably UI-only", read the code before signing. In that FRD three defects were
only findable in the source:

1. **A "no new endpoints required" claim was false** because a supporting read was capped
   (`rewards/route.ts` `take: 20`), which silently broke three mechanics that promised
   complete history. Check the *shape and limits* of the reads a spec depends on, not just
   whether the fields exist.
2. **The spec violated its own escalation rule inside the approved bucket** — it correctly
   flagged "linking to the compensation rank" as needing sign-off, then designed a
   seven-step cosmetic ladder using the compensation plan's tier-0 rank name ("Operator",
   `web/src/lib/compensation/plan.ts`). When a spec states a principle in one section,
   apply that principle to every other section yourself.
3. **"Fires once" / "first visit after X" mechanics are unspecified state.** The default
   implementation is a DB write, which silently converts a read-only feature into a
   stateful one. Rule on where the marker lives (`localStorage` vs. server) at approval
   time, or it gets decided by whoever writes the code.

## Choosing the metric is where the dark pattern gets designed in

Candidate metrics carry behaviour. "Share of users holding ≥2 concurrent positions" only
rises when users lock more capital, so adopting it instructs every downstream trade-off to
push commitment — even when the spec's own design carefully avoided that. Prefer metrics
about *retaining already-committed* value over *accumulating more*, and pair the primary
metric with explicit pass/fail guardrails (e.g. average principal per position must not
rise) so a win that came from pressure is legible as a failure.

Also: check that the proposed metric is *movable*. A metric that is ~100% by construction
(e.g. term-completion rate where no early-exit endpoint exists) will look like a success
regardless of what ships.

## Ask what cheaper mechanism moves the same number

Before approving an expensive feature, name the boring alternative aimed at the same metric
and commission a head-to-head sizing. For the staking game that was plain opt-in auto-renew.
Nobody downstream is positioned to raise this — it has to come from `pm`, and it is the
honest test of your own recommendation.

> **Amended 2026-08-09** by the entry *"A metric that measures an action cannot compare
> persuasion against automation"* below. The instinct is right; scoring both candidates on
> the same primary metric is not. Read the two entries together.

## Reversibility is a product requirement, not engineering hygiene

Constraints like an isolated i18n namespace and a route-scoped `dynamic()` import are
usually framed as bundle hygiene. When a feature ships against a sunset clause, restate them
as *reversibility requirements* so they cannot be traded away during implementation — they
are what make "remove it" a one-commit operation.

## Exposure data on a 100% rollout buys persuasion, not causation

*Learned 2026-08-08, ruling on the "add analytics so we can attribute the result" ask
(`docs/specs/oil-drilling-staking-game-exposure-instrumentation-ruling.md`).*

The standard request is "let us log who opened the feature so the metric isn't merely
correlational." On a feature that ships to 100% of users with no holdout, this is wrong in a
specific way worth remembering: exposure is **self-selected**, so "opened vs. never opened"
compares engaged users to disengaged users. The subgroup that opened would have scored better
with no feature at all. The result is biased toward "it worked" by an unbounded amount, and
— unlike a before/after read — nothing in the output signals that. **A number that is wrong
and looks rigorous is worse than one that is uncertain and looks uncertain.** Before/after
forces the hedge; a self-selected dose-response removes it.

What actually licenses a causal claim is randomisation, not observation. If it is wanted, the
cheap form is a **stateless deterministic holdout** — gate the entry point on a pure function
of `userId` (salted hash), computed identically at render time and in the analysis query,
stored nowhere. Zero rows, zero schema change, zero personal-data processing. Caveats: it is
worthless at low n, and the two hash implementations must be provably identical.

Sequencing matters more than the instrumentation debate: **close the power check first.** If
no available design can detect the target effect, attribution was never purchasable and the
whole argument was moot.

## Check that your guardrails are measurable before you rely on them

A pass/fail guardrail that leaves no trace in the system is not a guardrail, it is a hope.
Guardrail G2 (withdrawals blocked by locked staking principal) was written as a hard stop that
outranks the primary metric — and the blocking branch returns a 400 *before* any row is
created (`web/src/app/api/nia/withdrawals/route.ts`), so the event is invisible to every query.
Verify measurability at ruling time, not at readout time.

The corollary is a priority rule worth stating out loud when measurement effort is scarce:
**instrument harm detection before you instrument attribution of success.** Also note that
guardrails survive a correlational downgrade intact — "did a bad thing happen while this was
live" is adequately answered by before/after data, even when "did this feature cause the good
thing" is not.

> **Extended 2026-08-09.** Apply the same measurability check to *every* metric a spec
> proposes, not only the guardrails, and re-run it whenever an adjacent ruling changes what
> may be recorded. The auto-renew PRD's A5 ("blocked-withdrawal attempts among users with a
> renewed position") was uncomputable the day it was written, because the only instrument for
> that event had been ruled anonymous-by-constraint in a *different* document. A metric can be
> killed by a ruling it never mentions.

## Asymmetric evidentiary standards for stop vs. expand

When a readout can only be correlational, do not throw it away and do not launder it. Rule
explicitly that it is **sufficient to sunset a feature and insufficient to expand one**. The
asymmetry is justified by asymmetric costs: removal is cheap and reversible, while expansion
buys art spend. This converts an unattributable number from a
thing people argue about into a thing that still makes one decision cleanly.

Pair it with mandatory verbatim label text and an explicit list of prohibited causal verbs
(*caused, drove, lifted, uplift, impact of, attributable to*), binding on all six locale
renderings — otherwise the hedge is dropped at the first summarisation, usually in a slide.

## A metric that measures an action cannot compare persuasion against automation

*Learned 2026-08-09, retiring my own gate item 3 in
`docs/specs/staking-auto-renew-ruling.md` §3.*

I commissioned a head-to-head between a game surface and plain auto-renew "on the same M1."
M1 counted *positions redeployed within 7 days of maturity*. Auto-renew creates the successor
position **in the same transaction as the maturity flip** — so every renewal is an
unconditional +1, at offset zero, from a checkbox ticked months earlier. The game has to
persuade a human; auto-renew satisfies the metric by construction. The comparison was a
tautology, and it would always have "won" by a margin carrying no information.

The generalisation: **behaviour metrics silently assume the counted event is evidence a human
decided something.** An automation candidate breaks that assumption without breaking the
query, so the defect is invisible in the metric definition and only shows up if you trace how
each candidate produces the event. Before comparing two mechanisms on one number, ask: *does
each produce this event by persuading someone, or by executing something?* If they differ,
they are not commensurable and no amount of splitting fully fixes it.

Two further traps found in the same pass:

- **Splitting the metric cleans the numerator, not the population.** Isolating manual from
  automated redeployments still leaves the automated feature *removing* its opt-ins — the
  users most likely to redeploy anyway — from the manual pool. The comparison feature is then
  measured on a population stripped of its best performers, against a baseline that still
  contained them. Disclose the direction of the bias; do not build epicycles against it.
- **When two features can breach the same guardrail, rule on the tie-break before either
  ships.** Auto-renew predictably raises the blocked-withdrawal guardrail that the game is
  judged on. Decide *in advance* which one pauses when the diagnostic is inconclusive
  (principle used: the one that mechanically increases lock duration goes first; the one that
  performs no writes cannot be the cause). Deciding this under incident pressure means it gets
  decided by whoever has most invested in one of the two.

And the meta-lesson: when a commissioned agent reports that the comparison you designed cannot
produce a meaningful result, **that is the deliverable**, not a hedge. Take the correction and
name it as your own error in the ruling — an "honest challenge to my own recommendation" that
cannot return a meaningful answer is decorative, and leaving it standing would have laundered
a tautology into a business case.

## A ledger row is not a payment — trace the money to the withdrawable balance

*Learned 2026-08-10, ruling the DEEP CORE yield-linkage gate
(`docs/specs/deep-core-00-overview-and-gate.md` §6).*

Before approving any mechanic that **adds to** an existing payout ledger, follow that ledger
to the point where a user can actually withdraw the funds. In this repo the staking
settlement writes `StakingPayout` rows and updates `StakePosition.paidInterest`, and the UI
renders the total as "Rewards Earned" — but withdrawable balance is computed as
`nia balance − locked principal` (`api/nia/withdrawals/route.ts`), which never reads
`paidInterest`. Principal never moves either; staking is a soft lock over the Nia wallet. So
the entire interest stream is an **unsettled liability recorded only in BANA's own Postgres**,
and `ReferralBonusPayout` has exactly the same shape.

Three things follow, and they generalise past this feature:

1. **"Same rail as the existing payout" is not reassurance until you know the rail
   terminates in a payment.** The proposing agent had honestly flagged the payout path as an
   open engineering question and ranked it last of six. It was actually the precondition for
   the other five. Re-rank an open question yourself when the answer determines whether the
   rest is meaningful.
2. **Approving issuance before the payment method exists lets the size get decided by
   accretion.** Whoever eventually builds the payout path inherits months of accumulated rows
   and must ratify them; a budget cap written into the spec cannot be applied retroactively.
   This is sharpened by any "prospective-only, no clawback" rule — that rule is correct, and
   precisely because of it, wrongly-issued rows are permanent.
3. **A displayed-but-unpayable number is a disclosure risk that grows when you gamify it.**
   Adding progression rewards and narrative to an accrual figure supplies a justification for
   treating it as real.

The usable form of the ruling: **approve the design, refuse the implementation, and convert
the unresolved question into a named release condition** that lifts the gate without a second
review once satisfied. That keeps the (good) design from being reworked while refusing to let
issuance start.

### Corollaries found in the same pass

- **A per-event bonus with no daily cap is a farm if the minimum size is nullable.** The XP/
  credit design capped the per-settlement-day accrual but left the "open a new position"
  award uncapped, and `StakingProduct.minAmount` is `String?`. Cross-read every accrual
  source against every cap; caps are usually written next to the source their author was
  thinking about.
- **Check the incentive of the *sum*, not each award.** Each award was individually
  duration-neutral, but a flat open-award plus a duration-proportional completion-award makes
  short, frequently-recycled positions strictly optimal. A design that carefully removed a
  deposit-size upsell can reintroduce it on the *frequency* axis.
- **`User.locale` cannot gate anything the user benefits from evading.** It is a
  self-declared, user-editable UI preference, so a "jurisdiction allowlist" keyed on it is a
  lock whose key is held by the person locked out. When the only enforceable control is the
  global kill switch, say so plainly: the choice becomes all-markets or no-markets, which is
  a decision someone must actually make rather than an implementation detail.
- **Re-verify "the build is broken" claims.** A spec justified a cleanup task with a stale
  reading of the work tree; the import had already been removed. False facts in an approved
  spec bill real engineering time.
- **Time-to-max-level is a liability schedule, not a retention curve.** When a progression
  cap is tied to a payout multiplier, shortening the curve accelerates the cost ramp. Refuse
  to tune it before the budget is sized, and say which of the two frames you are deciding in.

## Overriding the master's stated preference: find the version where they already got it

The user asked for deposit-size-proportional points. Rejecting it outright would have read as
obstruction. The decisive argument was that the request was **already satisfied structurally**
— the bonus is a percentage of interest, interest is proportional to principal, so a user with
10× the principal already receives 10× the bonus. Adding proportionality to the points as well
would square the term, not introduce it.

When a policy instruction has to be declined, look first for the sense in which it is already
met by the existing design. That reframes the ruling from "no" to "this would apply it twice",
which is both more accurate and more persuasive — and it is a genuinely different check from
listing the risks of saying yes.

## "P0 but unbuildable" is a scoping failure, not a priority — split the tracks

*Learned 2026-08-10, writing `docs/specs/staking-payout-rail-prd.md`.*

When an issue is genuinely top-severity but its fix is blocked on an answer only an external
party can give, ranking it P0 and stopping there produces zero motion. Separate the parts by
**dependency, not by importance**: the disclosure/visibility half (stop asserting the false
thing; make the size of the liability visible somewhere) usually has no external dependency
and can ship immediately, while the money-movement half waits. The visibility work is also
what sizes the blocked work, so it is a prerequisite, not a consolation prize.

Corollary: **"turn off the accrual" is not a fix, it is evidence destruction.** If the debt is
genuinely owed, keep accruing, keep the rows, and measure the total. Decide this explicitly and
say so, because "pause it until we can pay" reads as prudent and isn't.

## When the fix demands a change to your most dangerous route, look for the design where the change disappears

The investigation offered two payout timings (push at settlement vs. pull inside the withdrawal
route) and recommended the pull. Both required editing either the unattended settlement job or
the withdrawal route — the two highest-risk surfaces in the app. A third option (an explicit
user-initiated claim) made the required change *vanish*: once interest is credited it is
ordinary hub balance, so `available = niaBal − locked` is already correct and the withdrawal
route is not touched at all. **Before accepting a menu of options, check whether any option
removes the requirement rather than satisfying it.** A good sign you have found one: the spec's
own "required formula change" section becomes empty.

Two supporting heuristics from the same pass:

- **Count the external money movements a design implies.** Daily push = one transfer per
  position per day (dust amounts, plus one audit row each); claim = one per user action,
  batched. Call volume is a design property worth ranking options by, not an implementation
  detail.
- **Prefer the mechanism-agnostic surface.** The claim button looks identical whether the
  partner exposes a credit API or funds move some other way — which meant the product design
  could be finalised *without* the blocking answer. Options whose UX depends on the unknown
  cannot be decided until it lands.

Watch the adjacent temptation: a "claim your own money" action is a magnet for streaks and
bonuses. Rule it mechanical and un-gamified in the same document, before someone else does.

## An unanswerable question deserves a copy-pasteable question, not a flag

Marking something "must be confirmed with the partner" moves it nowhere; the next person still
has to compose the ask. Write the numbered questions verbatim in the PRD (endpoint existence,
auth scheme, idempotency support, fee, minimum unit, status-lookup for ambiguous failures), say
who sends it, and state what changes in the spec under each possible answer. Mark in the same
table which questions are *ops* questions rather than *code* questions — e.g. "is admin-granted
principal actually deposited into the user's hub wallet?" is unanswerable from the repo, and
its answer flips a finding between "no bug at all" and "active user harm today."

## Read the write path of every actor, not just the user's

Chasing the interest-payout gap surfaced a second defect visible only from the *admin* path:
admin-granted staking positions create principal with no hub balance behind it, yet that
principal is summed by the same locked-principal helper the withdrawal route subtracts from the
user's real balance. If grants are not separately funded, a "bonus" silently reduces how much of
their own money the user can withdraw — the same ledger/balance desync as the headline bug,
running in the opposite direction. Enumerate every writer of a shared field (user route, admin
route, worker, migration) before concluding you understand what it means.

Two smaller field notes from the same review:

- **A recomputed column is not an incrementable one.** `paidInterest` is overwritten each cycle
  as `perDay × dueDays`, so any new "amount actually settled" column must accumulate from
  successful transfers, never from a delta on the recomputed one. Say this in the PRD; the
  natural implementation instinct is the wrong one.
- **`git status` is part of the evidence.** A file cited by the investigation
  (`stakingRenew.ts`) did not exist in the work tree because another agent was mid-write, so
  that citation was unverifiable and the renewal path's money semantics (does it compound
  unpaid interest into new principal?) had to become an explicit blocking question rather than
  an inherited assumption.
