# Compensation Plan UI — Build Spec Review (PRE-BUILD)

> **Status:** review of the build prompt. Nothing built.
> **Date:** 2026-08-07
> Companion to [compensation-plan-ui-plan.md](compensation-plan-ui-plan.md).

## 0. Existence check

Requested: skip anything that already exists. Verified — **nothing exists**:

```
find web/src -ipath "*compensat*"   → (empty)
web/src/hooks/                       → does not exist
web/src/types/                       → exists, contains only next-auth.d.ts
```

All 7 files (6 + `fixtures.ts`) are new. Nothing to skip.

---

## 1. BLOCKER — the example table mixes USD and BANA

`EarningsCalculator` (FILE 6) as specced:

| Package | Monthly Fast Start | "Daily Emission (30d)" | Total/Month |
|---|---|---|---|
| Orbit | $89.70 | **$24.54** | **$114.24** |
| Solar | $116.70 | **$36.84** | **$153.54** |
| Interstellar | $179.70 | **$61.38** | **$241.08** |

`89.70 + 24.54 = 114.24` is arithmetically correct but **adds US dollars to BANA tokens**.
24.54 is a token quantity, not $24.54.

Rendering it with a `$` and summing it into a dollar total **asserts that 1 BANA = $1.00**.
That is an implied token valuation and an implied income claim — the exact thing every other
rule in this spec exists to prevent. It is also the one number in the component a prospect
would screenshot.

**This cannot ship as written.** Options:

- **★ 1A — Split the columns; never sum.** `Monthly Fast Start (USD)` and
  `Monthly Emission (BANA)` as two separate, differently-styled columns. **No Total column.**
  Caption: *"Emission is a token quantity. BANA has no established price; these figures
  cannot be added."*
- **1B — Keep a Total column, USD only** (Fast Start only), with emission in its own BANA
  column outside the total.
- **1C — Provide an official BANA reference price** and label it loudly as such. I do not
  recommend this; it converts the component into a price claim.

**I need your answer before I write FILE 6.**

---

## 2. Math errors in the spec

### 2.1 The formula labels double-count slots

`dailyBana` **already includes** the slot multiplier. The labels re-apply it:

| Package | Label in spec | Label evaluates to | Value in spec | Correct formula |
|---|---|---|---|---|
| Orbit | `1 slot × 0.409 × 30` | 12.27 | 24.54 | `0.409 × 30 × 2 qty` ✓ |
| Solar | `1.5 × 0.614 × 30` | 27.63 | 36.84 | `0.614 × 30 × 2 qty` ✓ |
| Interstellar | `2.5 × 1.023 × 30` | 76.73 | 61.38 | `1.023 × 30 × 2 qty` ✓ |

**The values are right; the printed formulas are wrong** — they omit `× 2 qty` and
double-apply slots. A visible formula that doesn't produce the number beside it destroys
trust in the whole component. Correct form: `0.409 BANA/day × 30 days × 2 packages`.

### 2.2 The same bug is baked into the function signature

```ts
calculateMonthlyEmission(packageId, slots)   // spec
  → dailyBana × slots × 30
```

For Solar this returns `0.614 × 1.5 × 30 = 27.63` — **50% too high**, because `0.614` is
already the 1.5-slot rate. Proposed fix:

```ts
calculateMonthlyEmission(packageId: PackageId, quantity = 1, days = 30): Decimal
  → PACKAGES[packageId].dailyBana × quantity × days
```

`quantity` = number of packages owned. Slots are never multiplied in again. Confirm.

### 2.3 Column header is wrong

`"Daily Emission (30d)"` shows a **monthly** figure for **two** packages. Rename to
`Monthly Emission (BANA) — 2 packages`.

### 2.4 Rounding: which is authoritative?

`1.5 × 0.409 = 0.6135` but the spec pins `0.614`. `2.5 × 0.409 = 1.0225` vs pinned `1.023`.

Over the 2,192-day emission life that is **+1.10 BANA per Solar package** and
**+1.64 per Interstellar**. Across 725,000 slots it is a real number.

You said these are FIXED, so I will use `0.614` / `1.023` verbatim — but confirm the plan
document itself specifies the rounded rates, rather than them being a rounded presentation
of `slots × 0.409`. If it's presentational, we should derive.

---

## 3. Conflicts inside the prompt

### 3.1 Gold
> "dark slate/indigo with emerald accents (**NO gold**)"

then, FILE 5:
> "Colors: blue, orange, green, **gold**, pink"

Which wins? **★ Recommendation:** drop gold; use a 5-step palette that survives the light-mode
override layer — `indigo-500 / amber-500 / emerald-500 / sky-500 / rose-500`. Also note
"blue, orange, green, gold, pink" against a slate/indigo card is five saturated hues with no
shared logic; the suggested set keeps the emerald accent dominant.

### 3.2 TypeScript strict
> "TypeScript strict: no any, no implicit any, all types explicit"

`web/tsconfig.json:32` is **`"strict": false`**. Flipping it globally would surface errors
across the whole existing app — out of scope and not my call.

**★ Recommendation:** write all 7 files as if strict were on (no `any`, every param and return
annotated). They will then compile clean under strict whenever you flip it. I will not enable
the flag. Confirm.

---

## 4. CLAUDE.md rule conflicts

### 4.1 `number` return types violate rule 2 — must be `Decimal`

The spec says `calculateFastStart(...): number` and `UserEarnings` fields as `number`.
CLAUDE.md rule 2 forbids `Number()`/`parseFloat()`/float math on amounts; `code-compliance-checker`
blocks the commit. Precedent already in-repo: [stakingMath.ts](web/src/lib/stakingMath.ts),
[referralBonusMath.ts](web/src/lib/referralBonusMath.ts) — both pure, `Decimal`, colocated
`.test.ts`.

**★ Proposal:** internals and return types are `Decimal`; components call `.toFixed(2)` at the
render edge. Public shape stays identical otherwise. This is not optional — rule 2 is a hard rule.

### 4.2 Paths don't match the repo

| Spec | Actual |
|---|---|
| `src/types/compensation-plan.ts` | `web/src/types/compensation-plan.ts` |
| `src/lib/compensation-plan/calc.ts` | `web/src/lib/compensation/calc.ts` |
| `src/hooks/useEarningsCalculation.ts` | **`src/hooks/` does not exist** — hooks live in `src/lib/` (`useHubOnline.ts`, `useScreenNav.ts`) |
| `src/components/CompensationPlan/` | `web/src/components/compensation/` — existing subfolders are lowercase (`admin/ security/ staking/ wallet/`) |

**★ Recommendation:** follow the house layout. Creating `src/hooks/` for one file fragments the
convention. Say the word if you want the spec's paths instead.

---

## 5. Technical problems

### 5.1 `React.ErrorBoundary` does not exist
React exports no such component. Error boundaries require a class with
`componentDidCatch`/`getDerivedStateFromError`, or the `react-error-boundary` package (not
installed). The repo has **no error boundary anywhere**.

**★ Recommendation:** skip it. These are read-only presentational components over static
fixtures — there is no async, no fetch, nothing to throw. An error boundary here is ceremony.
If you want one, it's a separate app-wide task.

### 5.2 `console.warn` on fixtures will fire in production
As specced it warns on every render, in every build, and repeats on each re-render.
**★ Recommendation:** `if (process.env.NODE_ENV !== 'production')`, fired once via `useEffect`
with an empty dep array.

---

## 6. Spec ambiguities I will not guess

1. **`RankTracker` table shape.** "Requirements table (from `getRankTable`)" returns all 7
   ranks, but the specified columns are `Requirement | Current | Progress` — which is a
   4-row view of *one* rank. Which is it: (a) the full 7-rank ladder, (b) 4 requirement rows
   for the next rank, or (c) both, stacked?
2. **`EarningsCalculator`'s `packageId` prop is unused.** The table always renders all three
   packages statically. Does the prop highlight a row, or should it be dropped?
3. **Exact fixture values.** "Relay rank with 50% progress" — 50% toward Beacon
   (10 / 25,000 / 110) implies 5 customers / 12,500 CV / 55 slots. Confirm, or give real numbers.
4. **Progress vs. which rank.** Progress bars measure toward the *next* rank — but Keystone
   has none. What renders at max rank?
5. **Operator's blank cells.** Weak-Leg CV, Active Slots, Pool Shares are `—` for Operator
   (also Pool Shares for Verifier). Typed as `number | null`, rendered `—`. Confirm null means
   "no requirement", not "unknown".
6. **Pool bonuses aren't per-sale.** Rank Pool is "3% of company volume" and Global Pool is
   "2% to top 20 sellers" — company-wide pools, not slices of *your* sale. The stacked bar puts
   them beside Fast Start (15% of a sale you made), which reads as five slices of one sale.
   Should the bar be labeled *"how the 35% payout pool is allocated company-wide"*?
7. **Two components silently dropped.** The earlier brief had `EarningsDashboard.tsx` and
   `ComplianceReference.tsx`; this one doesn't. Deferred, or cut? `ComplianceReference` is
   still blocked on the full plan text and the 8 Hard Rules regardless.

---

## 7. What I'd change, summarized

| # | Issue | Severity | Proposed |
|---|---|---|---|
| 1 | USD + BANA summed into one `$` total | **Blocker** | Split columns, no total (1A) |
| 2 | `calculateMonthlyEmission` double-counts slots | **Blocker** | `(packageId, quantity, days)` |
| 3 | Printed formulas ≠ printed values | High | `rate × days × qty` |
| 4 | `number` breaks CLAUDE.md rule 2 | High | `Decimal` throughout |
| 5 | Gold: forbidden and required | Medium | Drop gold |
| 6 | `strict: true` not enabled repo-wide | Medium | Write strict-clean, don't flip flag |
| 7 | Paths / `src/hooks/` don't exist | Medium | House layout |
| 8 | `React.ErrorBoundary` isn't real | Medium | Omit |
| 9 | `console.warn` in production | Low | Dev-only, once |
| 10 | Column header says "Daily", shows monthly | Low | Rename |

---

## 8. Build order once unblocked

1. `types/compensation-plan.ts` + `lib/compensation/plan.ts` (frozen constants)
2. `lib/compensation/calc.ts` + **`calc.test.ts`** — vitest is wired (`npm test`); asserts
   `Σ bonuses === 35%` and every number in the FILE 6 table
3. `lib/compensation/fixtures.ts`
4. `lib/useEarningsCalculation.ts`
5. `components/compensation/BonusBreakdown.tsx`
6. `components/compensation/RankTracker.tsx`
7. `components/compensation/EarningsCalculator.tsx` — **last**, gated on §1

Steps 1–4 unblock the moment §1, §2.2 and §4.1 are answered.
