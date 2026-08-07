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
- **Never attach a reward or celebration FX to a recruitment count** in anything layered on this
  plan. Gamified recruitment with rewards on an MLM structure is the fact pattern that gets screened
  *as a pattern* (`compensation-game-oil-drilling-scoping.md` §3.2). Read-only progress mirrors are safe.
- **All game text as DOM overlay; canvas for art only.** The deciding reason is not i18n or a11y
  (both real) — it is that a compliance string baked into a texture cannot be linted by a test, and
  disclosure strings in this repo are test-enforced.
- When a brief asks for a mechanic the constraints forbid, say so in a top-of-document section and
  raise it as the first open question. Do not deliver a cosmetic near-miss and let the reader assume
  the ask was met.
