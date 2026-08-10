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
- **`ReferralPanel` no longer renders on `/staking`** — it moved to `/referral`
  (`docs/specs/referral-panel-relocation-frd.md`). Older notes citing `Staking.tsx:387` / `:118` are
  both stale; re-read before citing any line number in that file.
- **The `oil-drilling-staking-game-realtime-*` game tree is gone from the working tree** as of
  2026-08-10 (`components/staking/field-live/` and `lib/oilfield*.ts` all absent) **but
  `Staking.tsx:9` still imports `./staking/field-live/OilFieldEmbed` and renders it at `:389`**,
  with `scrollToPosition` (`:195`) / `scrollToProducts` (`:200`) surviving as its only consumers.
  `phaser@3.90.0` is still in `web/package.json:51`. Verify the tree builds before assuming any
  prior game surface exists — and before writing a spec that says "replaces the existing embed".
- The engine config that survived that family's ship gate and is worth inheriting: **960×540 fixed
  internal buffer, `Scale.FIT`, `CENTER_BOTH`, `transparent: true`, `fps.target: 30`**, with the CSS
  box (`h-[220px] sm:h-[300px] lg:h-[380px]`) doing all per-breakpoint sizing. Per-breakpoint
  internal resolution is banned as a device-class heuristic.

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