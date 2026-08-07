# Compensation Plan UI — Build Plan (DISCUSSION DRAFT)

> **Status:** proposal only. No code written. Read this, mark decisions in
> [§9 Open Decisions](#9-open-decisions), then we build.
> **Date:** 2026-08-07

---

## 1. What was requested

Six artifacts under a compensation-plan feature:

| # | File | Role |
|---|------|------|
| 1 | `EarningsDashboard.tsx` | package/slots/uptime, emission earned, bonus chart, 30-day graph |
| 2 | `RankTracker.tsx` | 7-rank ladder, requirements table, progress bars, monthly-requal warning |
| 3 | `BonusBreakdown.tsx` | stacked 15/10/5/3/2 bar, expandable detail |
| 4 | `EarningsCalculator.tsx` | packages/month → Fast Start output, compliance-gated |
| 5 | `ComplianceReference.tsx` | modal, 8 hard rules, FTC benchmark, "NOT an investment" |
| 6 | `useEarningsCalculation.ts` | pure calc hook |

---

## 2. Codebase reality check

I read the existing app before planning. Five things differ from the brief and change the build.

### 2.1 This is greenfield — nothing exists

`grep` across `web/src`, `web/prisma/schema.prisma`, and `docs/` for
*compensation, binary, fast-start, emission, orbit, solar, interstellar, weak-leg, slot, rank*
returns **zero hits** outside an unrelated Unity doc.

There is no package model, no slot model, no rank model, no binary tree, no uptime tracking,
no Nia-Hub endpoint for any of it. **The six components have no data source.**

The one adjacent thing that exists is a *different* referral system:
`ReferralBonusPayout` in [schema.prisma:265](web/prisma/schema.prisma#L265) with a two-layer
model (`layer1` 대·소실적 매칭, `layer2` 유니레벨 부스트), surfaced by
[ReferralPanel.tsx](web/src/components/ReferralPanel.tsx). **This is not the plan in the brief**
— different bonus names, different structure. See §9-D.

### 2.2 The theme is slate/indigo, not blue/gold

`globals.css` and every component use a fixed token set:

| Use | Class |
|-----|-------|
| Page bg | `bg-[#020617]` / `bg-[#06132a]` |
| Card | `bg-[#112643]/70 border border-[#1E3559] rounded-2xl` |
| Body text | `text-[#d8e2ff]` · muted `text-[#8c90a0]` · accent `text-[#afc6ff]` |
| Positive | `text-emerald-400` |
| Danger | `.bana-glass-red` (rose 500 @ 10%) |
| Type | IBM Plex Sans / **IBM Plex Mono for all numbers** |

There is **no gold** anywhere. Also important: [globals.css:80-367](web/src/app/globals.css#L80-L367)
is a **light-theme override layer keyed on the exact hex utility strings**
(`.light .bg-\[\#112643\] { … }`). Any *new* hex color I introduce will render
un-themed and broken in light mode unless it is registered there too.

→ **Recommendation:** build on existing tokens; introduce gold **only** as a rank-tier accent
(`#d4af37`), and register it in the light layer in the same change. Owner: `ui-ux-designer`.

### 2.3 No chart library — and none is needed

`package.json` has no recharts/chart.js/d3. But
[Dashboard.tsx:379-455](web/src/components/Dashboard.tsx#L379-L455) already hand-rolls a
**donut chart** (`<circle>` + `strokeDasharray`) and a **sparkline** (`<polyline>`), both with
`Decimal` math. That is the house pattern and it covers all three charts we need.

→ **Recommendation:** hand-rolled inline SVG. Adding recharts would be ~100 kB gzipped for
three static charts and would break the light-theme override approach.

### 2.4 decimal.js is mandatory (CLAUDE.md rule 2)

`Number()` / `parseFloat()` / `+string` on any amount is a hard rule violation flagged by
`code-compliance-checker`. Every rate, price, emission figure, and calculator input must be
`Decimal`. This is the main reason `useEarningsCalculation.ts` should be a pure module — see §5.

### 2.5 i18n is not optional

The app ships **6 locales** (`en/ko/ja/zh/vi/th`) via `next-intl`; 17 of 22 top-level
components call `useTranslations`. A compliance disclaimer that renders in English to a
Vietnamese or Korean user **is not a disclaimer** — it fails at exactly the job it exists to do.

This is the one place where i18n is a compliance requirement, not polish. But machine-
translated legal text is its own liability. See §9-C.

---

## 3. The plan's own numbers — verified

I checked the arithmetic in the brief. It is internally consistent, with one caveat.

**Emission**

```
650,000,000 BANA ÷ 725,000 slots = 896.5517…  BANA per slot (lifetime)
896.5517 ÷ 0.409 BANA/day        = 2,192 days ≈ 6.00 years
```

Per-package daily rate = `slots × 0.409`:

| Package | Price | Slots | Daily | ✓ vs brief |
|---------|-------|-------|-------|-----------|
| Orbit | $299 | 1.0 | 0.4090 | 0.409 ✓ |
| Solar | $389 | 1.5 | 0.6135 | 0.614 (rounded) ✓ |
| Interstellar | $599 | 2.5 | 1.0225 | 1.023 (rounded) ✓ |

→ **Recommendation:** store `BASE_DAILY = 0.409` + `slots` and **derive** the rate. Hardcoding
three constants (`0.409 / 0.614 / 1.023`) bakes in rounding error that compounds over a
2,192-day horizon — 0.614 vs 0.6135 drifts **1.2 BANA per Solar slot** across the emission life.

**Bonus pool**

```
15% + 10% + 5% + 3% + 2% = 35%  ← exactly the stated hard cap
```

The five bonuses **sum to precisely the 35% cap**. This matters for the UI: the stacked bar in
`BonusBreakdown` will visually read as "you get 35%", when in fact 35% is the *ceiling across
all participants combined* on a given sale, and a single user realistically touches one or two
slices. If the chart implies otherwise it becomes an implied income claim.

→ **Recommendation:** label the stacked bar **"How a $X sale is distributed"**, not
"your earnings", and render the 65%-to-network share **in the same bar** so the whole is 100%.
This is a small framing change that removes the strongest implied-claim in the whole spec.

**Fast Start example** — `$299 × 2 × 15% = $89.70` ✓ matches the brief.

---

## 4. Compliance assessment — read this section

I'll build this, and the brief's instincts (no projections, no guarantees, FTC benchmark,
gated calculator) are the right ones. But you should make these decisions knowingly.

### 4.1 What this structure is

Purchased packages + recruitment-linked bonuses + a binary weak-leg tree + monthly
requalification + a token that emits on a fixed schedule. Regardless of intent, that
combination is the fact pattern regulators screen for. Concretely, across BANA's six locales:

| Market | Exposure |
|--------|----------|
| **KR** | 방문판매법 — MLM operators must register; individual package price is capped (₩1.6M); 후원수당 total payout is **capped at 35% of sales**. Note: the brief's 35% cap matches the Korean statutory ceiling exactly — likely deliberate, worth confirming. 유사수신행위법 exposure if returns are presented as guaranteed. |
| **US** | FTC Business Opportunity Rule; *Howey* — a package sold with an expectation of profit from others' efforts is a securities question. |
| **VN / TH / CN** | Multi-level selling is restricted-to-prohibited; **CN bans MLM outright** (禁止传销). `zh` locale ships this UI into that jurisdiction. |
| **JP** | 連鎖販売取引 — mandatory pre-contract written disclosure, 20-day cooling-off. |

**I'm not a lawyer and this is not legal advice.** The point is narrower and I'm confident in it:
**this feature needs counsel sign-off per market before it ships**, and the `zh` locale needs an
explicit ship/no-ship decision. That is a business call, not a code call.

### 4.2 The calculator is the riskiest component

`EarningsCalculator.tsx` is, by construction, a projection tool. A compliance checkbox in front
of it does not change what a screenshot of its output looks like when forwarded to a prospect —
and forwarded screenshots are exactly how income-claim enforcement actions start.

Three options, my recommendation first:

- **(A) Ship it as a *rate reference*, not a calculator.** Input stays; output shows the
  *formula and rate* ("Fast Start pays 15% of package price") with a worked example on
  static, non-editable numbers. No user-driven total. Keeps the educational value, removes
  the "what if I sell 50/month" projection.
- **(B) Ship as specified**, gated + red disclaimer, and add a rendered watermark
  ("Illustrative — not an income projection") **inside** the results area so it survives
  screenshotting.
- **(C) Internal/admin-only.** Distributors never see it.

I'd go **A**, or **B** with the watermark as a hard requirement. Your call.

### 4.3 The FTC benchmark numbers need a source

The brief cites *"77% quit in 1 year, median $2,489/year."* I could not verify either figure
and **will not hardcode an unsourced statistic into a compliance component** — a wrong number
in a disclosure is worse than no number, because it is itself a misrepresentation.

The commonly cited figures in this space come from the **AARP Foundation (2018)** MLM study and
the **FTC's 2018 business-guidance materials**; "$2,489" resembles an AARP median but I can't
confirm the attribution or the year. → Assign `researcher` to produce a cited figure with a
primary-source URL before this string is written. Placeholder until then.

### 4.4 Things I will build in as non-negotiable defaults

- No component accepts or renders a user-supplied future-earnings figure.
- Every emission number labeled **"emission schedule, not earnings"** — emission is a token
  quantity, not USD, and its dollar value is unknown.
- Uptime shown as a **requirement**, not a feature: offline = $0, stated at the point of the
  number, not only in a footer.
- The word *investment*, *return*, *ROI*, *passive income*, *guaranteed* appears nowhere in
  any string except inside a negation.

---

## 5. Proposed architecture

### 5.1 Location & ownership

```
web/src/components/compensation/          ← new folder, matches admin/ security/ staking/ wallet/
├── EarningsDashboard.tsx
├── RankTracker.tsx
├── BonusBreakdown.tsx
├── EarningsCalculator.tsx
├── ComplianceReference.tsx
└── charts/
    ├── StackedBonusBar.tsx               ← inline SVG, shared by 1 + 3
    └── EmissionSparkline.tsx             ← inline SVG, Dashboard.tsx pattern

web/src/lib/compensation/
├── plan.ts                               ← single source of truth: packages, rates, ranks
└── calc.ts                               ← pure Decimal math, unit-tested with vitest

web/src/hooks/useEarningsCalculation.ts   ← thin React wrapper over calc.ts
```

**Why split `calc.ts` from the hook:** the brief asks for `useEarningsCalculation.ts` as a hook,
but the math must be unit-testable without React, and `vitest` is already wired
(`npm test`). Pure module + thin hook gives us both. The hook keeps the exact signature you
specified.

**Agent ownership** per CLAUDE.md: `web-wallet-expert` (components) · `ui-ux-designer`
(gold token + light-theme registration) · `routine-tasks` (tsc) · `deploy-manager` (commit/push).
`code-compliance-checker` must pass before commit — it will flag any stray `parseFloat`.

### 5.2 `plan.ts` — one source of truth

Every rate lives here once, as `Decimal`. No literal `0.15` in a component.

```ts
// shape only — illustrative
export const PACKAGES = {
  orbit:        { price: new Decimal(299), slots: new Decimal(1)   },
  solar:        { price: new Decimal(389), slots: new Decimal(1.5) },
  interstellar: { price: new Decimal(599), slots: new Decimal(2.5) },
} as const;

export const BASE_DAILY_BANA = new Decimal('0.409');   // per slot
export const EMISSION_POOL   = new Decimal(650_000_000);
export const TOTAL_SLOTS     = new Decimal(725_000);
export const PAYOUT_CAP      = new Decimal('0.35');    // hard cap; bonuses sum to exactly this

export const BONUSES = [
  { key: 'fastStart',  rate: new Decimal('0.15') },
  { key: 'binary',     rate: new Decimal('0.10') },
  { key: 'teamMatch',  rate: new Decimal('0.05') },
  { key: 'rankPool',   rate: new Decimal('0.03') },
  { key: 'globalPool', rate: new Decimal('0.02') },
] as const;
```

A vitest assertion that `sum(BONUSES) === PAYOUT_CAP` makes any future rate edit that breaks
the cap fail CI instead of shipping.

### 5.3 The data problem — biggest open question

`RankTracker` needs: personal customers, weak-leg CV, active slots, binary cap, pool shares,
current rank, monthly requal status. `EarningsDashboard` needs uptime % and 30 days of history.
**None of this exists** in Prisma or Nia-Hub.

Three ways forward:

| | Approach | Ships | Cost |
|---|---|---|---|
| **A** | **Presentational + typed props.** Components take a `CompensationSnapshot` prop. Storybook-ish demo page feeds fixtures. | now | zero backend; not user-facing yet |
| **B** | Prisma models + `/api/compensation/*` + real binary-tree calc | +2–3 weeks | large; `prisma-db-expert` + migrations; binary tree calc is the hard part |
| **C** | Nia-Hub owns the plan; we render `/api/nia/*` responses | depends on Nia-Hub | needs their spec first |

→ **Recommendation: A now.** Define `CompensationSnapshot` as the contract, build all six
components against it with fixtures, and let B or C fill it later without touching the UI.
It also means the compliance review happens on real rendered screens before any money logic
exists — which is the correct order.

### 5.4 Per-component notes

**1. EarningsDashboard** — Emission is deterministic (`slots × 0.409 × days`), so daily/monthly/
yearly are safe to show. The 30-day graph must plot **actual historical** emission, never a
forward projection; with approach A it renders from fixture history and shows an empty state
otherwise. The `"Fee income may be $0 during ramp-up"` banner: amber `.bana-glass` variant, above
the fold, not dismissible.

**2. RankTracker** — 7 ranks Operator→Keystone. The red monthly-requal warning should sit
**above** the progress bars; a user who reads only the top of the card must still see it.
Progress bars: `Decimal.min(current/required, 1)`, and never show >100%.

**3. BonusBreakdown** — see §3: render as 100% distribution (35% payout + 65% network), not as
"your earnings". Click-to-expand via `<details>` or local state; the green
*"Rates identical across ALL packages"* box is accurate and worth keeping — it's a genuine
anti-upsell disclosure.

**4. EarningsCalculator** — pending §4.2 decision. Compliance gate: checkbox state is local
(`useState`), re-arms on every mount — never persisted, or the gate stops being a gate.

**5. ComplianceReference** — **blocked**: I don't have the full plan text or the "8 Hard Rules".
Need the source document (§9-A). Modal pattern: reuse whatever `Settings.tsx` / `security/` use
for focus-trap consistency.

**6. useEarningsCalculation** — returns your exact shape
`{ dailyBana, monthlyBonus, totalMonthly, disclaimer }`, with `Decimal` (not `number`) for the
three numeric fields and `disclaimer` as an i18n **key**, not a literal string, so it translates.

---

## 6. What I'd build first

1. `plan.ts` + `calc.ts` + vitest suite — the numbers, locked and tested
2. `ComplianceReference.tsx` — the disclosure layer exists *before* anything that displays money
3. `BonusBreakdown.tsx` + `StackedBonusBar` — pure static data, no backend
4. `RankTracker.tsx` — needs the rank requirements table (§9-B)
5. `EarningsDashboard.tsx` — needs `CompensationSnapshot` fixtures
6. `EarningsCalculator.tsx` — last, after §4.2 is decided

Steps 1–3 are unblocked today.

---

## 7. Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Regulatory exposure across 6 locales, esp. `zh` | **High** | Counsel review per market; explicit ship/no-ship on `zh` |
| Unsourced FTC statistic in a compliance component | **High** | `researcher` sources it; placeholder until then |
| Calculator output screenshotted as an income claim | **High** | §4.2 option A, or B + baked-in watermark |
| Disclaimers English-only in ko/ja/vi/th | **High** | §9-C decision before launch |
| Stacked bar implies user earns 35% | Medium | Render as 100% distribution incl. 65% network |
| Rounded daily rates drift over 2,192 days | Medium | Derive from `slots × 0.409` |
| New hex colors break light mode | Low | Register in `globals.css` light layer, same change |
| `parseFloat` creeping into calc | Low | `code-compliance-checker` + vitest |

---

## 8. Deliberately not doing

- Not adding a chart library
- Not writing Prisma models or migrations (approach A)
- Not touching the existing `ReferralBonusPayout` system until §9-D is answered
- Not committing anything — `deploy-manager` only, per CLAUDE.md rule 5

---

## 9. Open Decisions

**A. `ComplianceReference` source text** — I need the full compensation plan document and the
verbatim "8 Hard Rules". I will not paraphrase legal text into a compliance modal. **Blocking
for component 5.**

**B. Rank requirements table** — the brief names 7 ranks and 5 columns but gives no values.
I need the actual thresholds (personal customers, weak-leg CV, active slots, binary cap,
pool shares) for each of Operator / Verifier / Relay / Beacon / Sentinel / Anchor / Keystone.
**Blocking for component 2.**

**C. Disclaimer i18n** — pick one:
   1. Translate all compliance strings, human-reviewed per market *(correct, slowest)*
   2. English-locked legal text + translated UI chrome *(common in fintech; defensible)*
   3. English-only *(not recommended — the disclosure fails for most of your locales)*

**D. Relationship to the existing referral system** — does this plan **replace**
`ReferralBonusPayout` (layer1 매칭 / layer2 유니레벨) and `ReferralPanel.tsx`, run
**alongside** it, or is one of them legacy? This determines whether we build in isolation or
plan a migration.

**E. Calculator disposition** — §4.2 option A, B, or C.

**F. Data source** — §5.3 approach A, B, or C. *(I recommend A.)*

**G. Gold accent** — add `#d4af37` as a rank-tier accent, or stay slate/indigo/emerald?

**H. Route + visibility** — where does this live (`/compensation`? `/earnings`?), and is it
gated to users who own a package, or visible to all?

---

*Nothing built. Answer A, B, E, F and steps 1–3 can start immediately.*
