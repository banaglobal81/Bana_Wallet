# Compensation Plan — Information Request (copy-paste prompt)

> Send everything between the `---` markers to whoever owns the compensation plan
> (AI assistant or plan architect). It is self-contained.
> Answers feed directly into [compensation-plan-ui-plan.md](compensation-plan-ui-plan.md).

---

You are helping me specify a compensation-plan UI for **BANA**, a B2B crypto wallet
platform (Next.js 15 / React 19 / TypeScript, 6 locales: en/ko/ja/zh/vi/th).

I am building six front-end components: an earnings dashboard, a rank tracker, a bonus
breakdown chart, an earnings calculator, a compliance reference modal, and a shared
calculation hook. The components must be **compliance-first**: no income projections, no
guarantees, no implied returns.

Here is the compensation plan as it was described to me. It is incomplete, which is why
I'm writing:

- **3 packages:** Orbit $299 (1 slot), Solar $389 (1.5 slots), Interstellar $599 (2.5 slots)
- **5 bonuses:** Fast Start 15%, BANA Binary 10%, Team Builder Match 5%, Rank Pool 3%,
  Global Pool 2%
- **7 ranks:** Operator → Verifier → Relay → Beacon → Sentinel → Anchor → Keystone
- **Emission:** 650,000,000 BANA ÷ 725,000 slots = 896.55 BANA per slot lifetime;
  0.409 BANA/day per slot (≈ 2,192 days ≈ 6 years)
- **Transaction fees:** variable, may be $0 initially
- **Hard cap:** 35% max payout per package sale, 65% to network

I have verified the arithmetic above and it is internally consistent. Note that the five
bonus rates sum to **exactly** the 35% hard cap.

Answer the sections below **in order**, using the exact headings. Where you do not know an
answer, write `UNKNOWN — needs decision by <who>` rather than inventing a value. **Do not
guess numbers.** A wrong number in a compliance component is worse than a missing one.

---

## SECTION 1 — BLOCKING (I cannot build without these)

### 1.1 Full plan text
Provide the complete compensation plan document, verbatim. I need the actual source text
for a compliance reference modal.

### 1.2 The "8 Hard Rules"
Provide all 8, verbatim and numbered. These render as expandable items in the compliance
modal, so I need the exact wording, not a summary.

### 1.3 Rank requirements table
Fill in every cell. Blank cells block the rank tracker entirely.

| Rank | Personal Customers | Weak-Leg CV | Active Slots | Binary Cap | Pool Shares |
|------|-------------------|-------------|--------------|------------|-------------|
| Operator | | | | | |
| Verifier | | | | | |
| Relay | | | | | |
| Beacon | | | | | |
| Sentinel | | | | | |
| Anchor | | | | | |
| Keystone | | | | | |

Also state, for each column:
- **Units** — Binary Cap: USD/day, USD/week, or CV? Pool Shares: integer share count or %?
- **Weak-Leg CV** — is CV equal to package price, or a separate commissionable value per
  package? If separate, give CV for Orbit / Solar / Interstellar.
- **Active Slots** — the user's own slots, or total in their organization?

---

## SECTION 2 — MECHANICS THE UI MUST RENDER CORRECTLY

Short answers are fine, but each of these changes what the screen shows.

1. **Uptime.** "Offline nodes earn $0" — what exactly is measured? What is the sampling
   interval, and is there a minimum-uptime threshold below which emission stops entirely
   vs. is pro-rated? What does a user actually do to be "online"?
2. **Monthly requalification.** What resets on the 1st? Does a user drop one rank or to
   Operator? Is there a grace period? Is a rank ever permanent?
3. **Binary cap mechanics.** Is the cap daily or weekly? Does overflow carry forward, or is
   it flushed? Is there leg-volume compression or flushing, and when?
4. **Fast Start.** Paid on personally-enrolled sales only, or deeper? Paid once per sale, or
   recurring? Is there a clawback window on refunds/chargebacks?
5. **Team Builder Match 5%.** Matched on *what* — the downline's Fast Start, their binary,
   or their total? How many generations deep?
6. **Rank Pool 3% and Global Pool 2%.** Pool of what revenue, over what period? How is a
   share valued — total pool ÷ total shares? Paid weekly or monthly?
7. **Emission start and vesting.** Does the 0.409/day begin at purchase, at activation, or at
   a network launch date? Is emitted BANA immediately transferable, or locked/vesting?
8. **Slot sellout.** What happens at 725,000 slots? Do sales stop, or does the per-slot rate
   change? The UI needs to show remaining slots if that is a real constraint.
9. **Fractional slots.** Solar is 1.5 and Interstellar 2.5 slots — do fractional slots count
   as fractional for rank qualification and pool shares, or round down?
10. **Package upgrades.** Can a user upgrade Orbit → Interstellar? Do they pay the difference,
    and do slots and emission stack or replace?
11. **Transaction fee income.** How is it calculated and distributed when it is not $0? I have
    a banner saying it may be $0 during ramp-up, but I need to know what it becomes.
12. **Refunds.** What is the refund window, and what happens to bonuses
    already paid on a refunded package?

---

## SECTION 3 — COMPLIANCE (answer carefully)

### 3.3 Prohibited language
Confirm the terms that must never appear in the UI. My default deny-list is: *investment,
return, ROI, passive income, guaranteed, profit, yield*. Add anything else, and tell me the
approved substitutes.

---

## SECTION 4 — DECISIONS I NEED FROM YOU

Pick one option per item. My recommendation is marked ★.

**A. The earnings calculator.** It is a projection tool by construction; a compliance
checkbox does not change what a screenshot of its output looks like when forwarded to a
prospect.
- ★ **A1** — Ship it as a *rate reference*: shows the formula and a fixed worked example, no
  user-driven totals.
- **A2** — Ship as specced, gated, with "Illustrative — not an income projection" rendered
  *inside* the results area so it survives screenshotting.
- **A3** — Internal/admin only; distributors never see it.

**B. Disclaimer translation.** A disclaimer that renders in English to a Vietnamese or Korean
user fails at the one job it has.
- **B1** — Translate all compliance strings, human-reviewed per market (correct, slowest).
- **B3** — English only (not recommended).

**C. Relationship to the existing referral system.** BANA already ships a *different* live
referral program — a two-layer model (대·소실적 매칭 / 유니레벨 부스트) with its own database
table and user-facing panel. It does not match this plan's bonus names or structure.
- **C1** — This plan replaces it; the old one is retired and migrated.
- **C2** — They run alongside each other (explain how a user sees both without confusion).
- **C3** — One is legacy (say which).

**D. Data source.** None of rank, weak-leg CV, active slots, uptime, or binary position
currently exists in the database or the upstream API.
- ★ **D1** — Build the UI presentational against a typed snapshot contract with fixtures now;
  wire real data later without touching the components.
- **D2** — Build the database models and API first (+2–3 weeks; the binary tree calc is the
  hard part).
- **D3** — The upstream Nia-Hub API will own the plan — if so, provide their endpoint spec.

**E. Where it lives.** What route (`/compensation`? `/earnings`?), and is it visible to all
users or gated to those who own a package?

**F. Visual treatment.** The existing app is dark slate/indigo with emerald accents and has
no gold anywhere. Add a gold rank-tier accent, or stay on the current palette?

---

## SECTION 5 — OUTPUT FORMAT

- Answer in the section/numbering order above.
- Verbatim text (1.1, 1.2) in fenced code blocks, unedited.
- The rank table (1.3) as a filled markdown table.
- Mark every unknown as `UNKNOWN — needs decision by <who>`.
- Flag any place where the plan as written is internally inconsistent, rather than smoothing
  it over.
- Do not add income examples, projections, or illustrative earnings figures anywhere in your
  answer.

---

*End of request.*
