# Pattern Library — game-planner

Read on demand by `game-planner` only, when the current task's scope overlaps an entry below. See `CLAUDE.md` § Agent Self-Update Protocol for edit rules.

---

## Compensation-plan facts that briefs keep getting wrong

Verified 2026-08-07 against `web/src/lib/compensation/plan.ts`. Re-verify before reusing.

- **There is no `BASE_DAILY_BANA` export.** `PACKAGES[id].dailyBana` is authoritative and *not*
  derived — `0.409 / 0.614 / 1.023` exactly. `calc.test.ts` locks these. Never spec `slots × 0.409`.
- **The slot rule:** `slots` may multiply `LIFETIME_BANA_PER_SLOT`; `slots` may **never** multiply
  `dailyBana`. The second is the double-count trap called out in the file header and in `calc.ts`.
- Bonus id is **`match`**, not `teamMatch`. Ids: `fastStart`, `binary`, `match`, `rankPool`, `globalPool`.
- **Uptime has no data source.** It exists only inside disclosure strings (`calc.ts`,
  `RankTracker.tsx`). Any spec that treats rig/node status as available data is specifying a
  backend project, and should say so explicitly.
- `calc.ts` deliberately never sums USD and BANA — BANA has no official price. Any spec showing a
  BANA→USD figure contradicts the existing math layer.

## Design moves that survive compliance review

- **Delete the unit, delete the risk.** When a theme wants its own unit (barrels, gems, points),
  check whether the conversion rate to the real token is the actual hazard. Usually it is. Keeping
  the sprite as decoration while labeling every numeral in the real token removes the conversion
  entirely, at almost no thematic cost.
- **Derive progression from a ratio of real quantities, not a new constant.** Tying a progress bar
  to `credited ÷ lifetime` invents nothing, makes offline periods stall the bar automatically (no
  penalty rule needed), and produces a package-agnostic curve — which doubles as an anti-upsell
  property.
- **All game text as DOM overlay; canvas for art only.** The deciding reason is not i18n or a11y
  (both real) — it is that a compliance string baked into a texture cannot be linted by a test, and
  disclosure strings in this repo are test-enforced.
- When a brief asks for a mechanic the constraints forbid, say so in a top-of-document section and
  raise it as the first open question. Do not deliver a cosmetic near-miss and let the reader assume
  the ask was met.
- **Scale progression off term/day counts, never off principal.** Amount-driven tiers need a price
  feed, break across coins, and turn the whole surface into an upsell. Term days and credited-day
  counts are integers, coin-agnostic, server-maintained, and un-fakeable. Where a size difference is
  wanted anyway, make it *relative to the user's own largest position*, never to an absolute threshold.
- **A breakable daily streak is a dark pattern when the streak is maintained with real money.** Ship a
  non-decreasing odometer ("total operating days") instead — it keeps the accumulation satisfaction and
  removes the coercion. Same for hidden/mystery milestone criteria: unpublished thresholds are a
  variable-reward schedule in disguise.
- **"No new tables, columns, or writes" is a usable tripwire for the cosmetic/money boundary.** If a
  mechanic needs to persist game state, it has almost certainly stopped being cosmetic. Cheap to state
  in a spec, and it makes the gate self-enforcing during implementation.
- **The mirror you build by accident is the one that ships.** I argued at B5 that even a read-only
  resemblance to the compensation rank ladder is exposure, then specified a seven-step titled ladder
  using the plan's entry-rank noun in the same document. Apply your own stated principle to your own
  §4 before filing, not just to the section where you stated it.

## Staking facts that specs keep getting wrong

Verified 2026-08-08 against `web/prisma/schema.prisma`, `web/src/utils/stakingApi.ts`,
`web/src/lib/stakingMath.ts`; `Staking.tsx` facts re-verified 2026-08-10. Re-verify before reusing.

- **`docs/specs/staking-and-coins-plan.md` is stale.** It says "no code written yet"; staking shipped
  (3 migrations from 2026-06/07). Always read the schema and `stakingApi.ts`, not the plan doc.
- **Interest is credited *daily*, not at maturity.** A `StakingPayout` row per `(positionId, dayIndex)`,
  `@@unique` so re-runs are idempotent. `paidInterest` / `daysPaid` are the server-authoritative
  "really credited" figures — the ideal XP/progress source, and they satisfy the idle genre's
  server-time-anchoring requirement for free.
- **`accruedInterest` (computed on read) and `paidInterest` (worker-credited) can diverge**, and the
  worker can be switched off entirely (`PlatformSetting.stakingWorkerEnabled`). Any spec needs an
  honest "reporting paused" state; don't design a UI that assumes they're equal.
- **A "staking day" is configurable** — `STAKING_DAY_MS` / `NEXT_PUBLIC_STAKING_DAY_MS`, read by
  `stakingDayMs()`. Never spec a hardcoded 24h cadence; demo builds compress it.
- Rate and term are **snapshotted per position**, so two positions on one product can legitimately
  differ. Read them off the position, never off the product, once the position exists.
- **There is no early unstake and no unstake endpoint.** Any mechanic implying a position can be
  stopped, sold, abandoned, or accelerated is specifying a product change, not a game feature.
- **Opt-in auto-renew is live** (`setAutoRenew`, `position.autoRenew`, `renewalStatus`,
  `renewedIntoPositionId`, confirm sheet, neutral outcome notice, 90-day cap constant duplicated
  client-side). Consequence for any game surface: a renewal silently creates a **successor position**,
  so any "a new position appeared → celebrate" animation will fire on an automatic re-lock, which
  decision doc §4 B3(c) forbids. Suppress the animation, don't hide the position.
  **Superseded for V2 (2026-08-11):** `staking-v2-auto-renew-cutover-ruling.md` defers the V2 renewal
  engine to T-20 — `AUTO_RENEW_V2_ENABLED = false`, no supported path sets
  `StakePositionV2.renewedFromPositionId`. The legacy files and rulings stay valid and revive at T-20.
- **`ReferralPanel` no longer renders on `/staking`** — it moved to `/referral`
  (`docs/specs/referral-panel-relocation-frd.md`). Older notes citing `Staking.tsx:387` / `:118` are
  both stale; re-read before citing any line number in that file.
- **The `oil-drilling-staking-game-realtime-*` game tree is gone from the working tree** as of
  2026-08-10 (`components/staking/field-live/` and `lib/oilfield*.ts` all absent) **but
  `Staking.tsx:9` still imports `./staking/field-live/OilFieldEmbed` and renders it at `:389`**,
  with `scrollToPosition` (`:195`) / `scrollToProducts` (`:200`) surviving as its only consumers.
  `phaser@3.90.0` is still in `web/package.json:51`. Verify the tree builds before assuming any
  prior game surface exists — and before writing a spec that says "replaces the existing embed".
  **Update 2026-08-11:** `Staking.tsx` now renders `DeepCoreEmbed` (`./staking/deep-core/`), not
  `OilFieldEmbed`. The dead leftover is the **locale side**: the whole `oilfield` namespace
  (`messages/en.json:1126-1182`) survives with **zero references in `web/src`**. Do not cite any
  `oilfield.*` key as live copy — the live DEEP CORE namespace is `staking.game.*`.
- The engine config that survived that family's ship gate and is worth inheriting: **960×540 fixed
  internal buffer, `Scale.FIT`, `CENTER_BOTH`, `transparent: true`, `fps.target: 30`**, with the CSS
  box (`h-[220px] sm:h-[300px] lg:h-[380px]`) doing all per-breakpoint sizing. Per-breakpoint
  internal resolution is banned as a device-class heuristic.

## Planning a schema swap under a live game

Written 2026-08-10 while specifying the A-6 DEEP CORE adapter contract
(`staking-yield-system-v2-design-a6-deepcore-adapter.md`).

- **A field-mapping table counts Prisma columns; it does not count dependencies.** DEEP CORE's
  "13 fields" contract missed four things that would each have broken it: `stakingDayMs()` imported
  from a file on the deletion list (build break), the surface-state flag still pointing at the *old*
  worker (a silent lie about whether settlement is running), the lazy `ACTIVE→MATURED` call the route
  makes *before* the game reads (drop it and progression freezes silently), and the API route
  carrying the `game` block being deleted. Walk the adapter file line by line, not just the schema diff.
- **Split the rename from the cutover.** If the acceptance criterion is "the existing test file passes
  unmodified", any field rename in the same commit forces a test edit and destroys the signal.
  Repackage in the adapter first; do the naming-hygiene rename as a separate commit whose own
  criterion is "every `expect()` value identical".
- **Timestamp semantics are a game mechanic.** Payout rows stamped `@default(now())` mean a caught-up
  worker collapses N missed days into one day key — and day keys are exactly what the operating-day
  odometer and the per-day XP cap are computed from. A well-meaning v2 implementer backfilling
  `settledAt` to the accrual day would silently turn an outage into an XP surge. Freeze the semantics
  in the spec, and name the known trade-off you are *not* fixing.
- **"Read both tables during the transition" is a farming hole, not a kindness.** A per-day-key cap
  (`min(positions, 3) × 10`) gets applied twice if two sources are unioned. Reject dual-read on
  mechanics grounds, not just on data-authority grounds.
- **When new columns land next to the ones you read, write the forbidden-read list.** The old payout
  table gave the game nothing but `positionId`/`paidAt`; the v2 ledger puts
  `amount`/`bonusAmount`/`mpSnapshot` on the same row as the timestamp the game needs. What used to be
  impossible is now a one-line temptation — and reading `amount` reintroduces principal-scaled
  progression in a single character.
- **Existing unit tests are a necessary but insufficient acceptance criterion.** Of 19 DEEP CORE tests,
  7 stay green under a wrong flag mapping or a diverged day-length source, because the pure function
  never sees where its inputs came from. Pair "old tests unmodified" with a short list of *new*
  adapter-boundary tests, or the criterion certifies the wrong thing.

## Auditing "no impact on the game" claims

Written 2026-08-11 during T-12 (`staking-yield-system-v2-t12-deep-core-impact-ruling.md`), verifying
the V2 creation-path cutover against DEEP CORE.

- **Ask what the removed feature was *suppressing*, not just what it was driving.** Auto-renew was
  deferred, so `renewedFromPositionId` is permanently null. That field's only use in the game is an
  *exclusion* (`continue`) guarding `charter_open` from renewal farming. Removing the feature doesn't
  break the guard — it makes manual re-staking the only path, so every user now collects the award the
  guard existed to suppress. "No impact" was right about the code and wrong about the incentive.
- **Term-neutral XP is easy to lose in one term.** `lift` (flat/day) and `charter_complete`
  (`min(300, ⌊10·t/3⌋)`, whose 300 cap binds at exactly t=90) are deliberately ~equal XP/day across
  every term. A per-position one-shot award like `charter_open` is inherently term-*inverted*
  (award ÷ termDays). Whenever a spec changes which terms are open or how often positions recycle,
  recompute XP/day per term — the inversion only shows up in that table.
- **A per-term liability argument that names auto-renew as "the only path" is usually wrong.** Manual
  re-staking reproduces one term's interest liability on the same cadence with identical arithmetic;
  the difference is friction, not the cap formula. Worth saying to `pm` even though the cap is not
  the game's area — it changes the urgency of their own open question.
- **Narrowing a term ladder can *improve* a relative-size visual.** `relativeSize = termDays/maxTermDays`
  rendered as `18 + rel×46` px: the old 10/360 pair produced 19.3px against an 18px floor (invisible);
  10/90 produces 23.1px. Check the extremes of the *value set*, not just "the formula still works" —
  and check that every art variant behind a threshold (here `rel >= 0.5` → `large`) is still reachable.
  The failure mode to warn about is the opposite one: a *single* open term makes everyone `rel = 1.0`,
  which kills the small asset and makes every user's field identical.
- **When told a file is untouched and you have no shell, verify by vocabulary and count.** Zero
  occurrences of the new schema's words in the test file, `it()` count matching the number the spec
  froze, and the adapter's forbidden-read `select` still literally two fields — three independent
  signals, none of which need `git`. Say plainly which tool you lacked.
- **The tempting read only becomes real when the writer ships.** The forbidden-read list (`amount`,
  `bonusAmount`, `mpSnapshot`) was theoretical until the v2 settlement engine actually started writing
  those columns. Re-verify the adapter's `select` on the commit that makes the temptation real, not on
  the commit that adds the list.

## Reading someone else's cross-area finding before implementing it

Written 2026-08-11 while adjudicating `product-planner`'s S-7 / EG-1~EG-3 handoff (T-8 FRD §5.6).

- **Verify the copy key exists before agreeing to preserve it.** EG-2 asked to keep
  `deepCore.notEligibleBody`. No such key: it is `oilfield.notEligibleBody`, the namespace of a
  *removed* game family, referenced nowhere in `web/src`. A cross-area finding written from a doc
  rather than from the tree can point at dead strings; grep the key and grep its usages.
- **The right verdict can arrive with the wrong reason, and the reason decides the fix.** "Dead end"
  was inaccurate (the CTA says "View staking products" and the sheet does show products). The real
  objection is that a CTA inside the game fiction promises a *game action* the platform can't honor —
  and that reason also tells you not to replace it with a status chip, because wallet/compliance state
  doesn't belong on the canvas overlay. Adopt the requirement, rewrite the rationale.
- **Gate a game CTA on the presence of the callback, never on a new state prop.** Passing `E-*` into
  the game component would make the game read staking eligibility and break the "game only reads game
  state" boundary the same FRD asserts. `onOpenStake != null` carries "an action exists" without
  carrying "why not".
- **Optional-prop fallbacks are the trap in "just stop passing the handler".** The HUD fell back to
  `scrollIntoView('#staking-earn-section')` — an element that no longer exists. Dropping the prop alone
  leaves a rendering, dead-clicking button: worse than before. Always name the fallback deletion as its
  own numbered instruction, and name the existing test that the deletion invalidates.
- **Check when an "edge case" becomes the main path.** The empty-rig CTA is unreachable today (every
  user is `S0_NOT_SHOWN`), which reads as low priority — but with no auto-renew and a 10-day product,
  every user hits that state ~36×/year after first product open. Date the reachability, don't just
  state it.

## Designing a game stat that moves real money

Written 2026-08-10 while specifying the `deep-core-*` family. All of it is pre-sign-off design;
none of it substitutes for the `pm` gate.

- **Never let the game write the position.** `dailyRatePct`/`termDays` are the user's contract
  snapshot; raising them from a game stat is a product change wearing a game costume. Put the bonus
  in a **shadow ledger** (`GameBonusPayout`) keyed by the same `@@unique([positionId, dayIndex])`
  as `StakingPayout`, and make the bonus row's existence *require* the payout row. Then "unpaid day
  → no bonus" and "worker re-run → no double credit" are structural, not policy.
- **Additive stats + linear cap, never multiplicative stacks.** The idle genre's default is
  multiplicative boosters; in a real-yield system that compounding is platform liability growth.
  Flat effect per tier with rising price yields diminishing returns for free — no damping rule needed.
- **An unreachable level cap is a compliance failure, not just a balance failure.** If max level
  gates the yield ceiling, an exponential (×1.4) or Fibonacci (φ≈1.618 — *steeper* than exponential,
  despite the common "gentle pacing" description) curve makes the ceiling reachable only by money.
  Use a polynomial curve so the ceiling is reachable by time alone, and align gear-completion cost to
  land on roughly the same day as max level so neither track dies early.
- **Ship the curve as a frozen generated table, not a runtime `Math.pow`.** The formula is provenance
  documentation; the N-row constant is the runtime authority, locked by a test.
- **Audit the acceleration graph, not just direct effects.** An "XP booster" is a yield item the
  moment level feeds the multiplier. Same for anything raising an earning cap, or revealing/advancing
  settlement. If progression → payout, then anything → progression is also → payout.
- **Two currencies split the gate for free.** One currency for the yield path, one for cosmetics: it
  removes the "buying a skin costs me money" coercion *and* makes the compliance boundary
  self-evident by name ("everything the gear currency touches is gated"). Cheaper than prose.
- **Non-retroactivity needs a promotion gate, not good intentions.** Store live `mp` plus
  `mpEffective` + `mpEffectiveFrom` (dayKey); settlement promotes only once the day key has passed.
  Otherwise a purchase made minutes before the run pays out on an already-elapsed day.
- **Budget breach → prospective auto-pause; never pro-rate, never claw back.** Pro-rating makes the
  same stat pay differently each day with no user-visible reason; clawback is the worst reputational
  outcome available. Explicit stop + notice beats opaque variance.
- **Exclude the game bonus from the referral/MLM base explicitly.** `payReferralBonuses` pays a % of
  interest — if the bonus lands in that base, the game becomes an emission multiplier and game level
  starts driving organization payouts.
- **Cap constants belong in code, not `PlatformSetting`.** A settings row that can double platform
  liability with one admin edit is not a cap. Let config *lower* it only; the ceiling ships as a
  reviewed code constant plus a hard assertion (`AUTO_RENEW_MAX_TERM_DAYS = 90` is the in-repo
  precedent for exactly this treatment).
- **Make the game the dependent party in the settlement pipeline.** Add game passes *after* the
  interest credit commits, per-position try/catch, idempotent retry next run. A game bug must never
  be able to block or roll back a real interest payment.
- **Phase the spec so the gate can fail without killing the work.** Splitting into "Phase 0, no money
  outcome" and "Phase 1, gated" gave `pm` a shippable product either way, and made the gate a scope
  decision instead of a go/no-go on the whole brief.
