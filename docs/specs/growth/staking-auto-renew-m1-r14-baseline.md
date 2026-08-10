# R-14 Response — M1 Query Definitions & Pre-Auto-Renew Baseline Freeze

> Status: **R-14 DELIVERABLE.** Owner: `growth-pm`. Date: 2026-08-09.
> Responds to: `docs/specs/staking-auto-renew-ruling.md` §3.2(a)/(c), §4 **R-14**, §5 (`growth-pm` row).
> Extends: `docs/specs/growth/oil-drilling-staking-game-metric-feasibility.md` §1–§3 (the 7-staking-day
> window definition and the `maturityAt`-anchor reasoning are not repeated here — read that document
> first if the "why `maturityAt`, why 7 staking-days" reasoning is needed).
> Also carries the two mandatory M1 reporting labels (Addendum 1 §4.1 + ruling R-10), per ruling §3.2.

This is a **prerequisite deliverable, not a metric readout.** No M1 figure is reported in this
document. §2 states plainly that the one number this document is supposed to freeze **could not be
produced in this pass**, and names exactly who must produce it and when.

---

## 0. What changed since the feasibility doc, in one line

The feasibility doc (2026-08-08) assumed a single, unsplit M1. The ruling (2026-08-09, §3.2a) splits
every future M1 into three numbers by the origin of the redeployment. This document formalizes the
three query definitions the split requires and executes the one action item (R-14) that has a hard
deadline: freezing the baseline **before** `renewedFromPositionId` starts being written to.

---

## 1. The three query definitions

All three share the same denominator and the same 7-staking-day window definition as the original
feasibility doc (`maturityAt`-anchored, `status IN ('MATURED','PAID')`, next-position `startAt` in
`(maturityAt, maturityAt + 7 × STAKING_DAY_MS]`). They differ only in how the numerator's matching
next-position is classified by `StakePosition.renewedFromPositionId` (added by the auto-renew
migration; **does not exist in the schema as of this writing** — confirmed by reading
`web/prisma/schema.prisma:224-251` and `web/prisma/migrations/` directly, no such column and no
migration past `20260808170604_add_staking_payout_user_paidat_index`).

### 1.1 Classification logic

A matured position `m` is classified per-window as:

- **auto-redeployed** if a `StakePosition` exists with `renewedFromPositionId = m.id` (the exact FK
  auto-renew writes, per ruling PRD §3/AC-26). This is the precise link, not a time-window guess —
  auto-renew fires at offset zero from `m.maturityAt` by construction (ruling §3.1), so this will in
  practice always also fall inside the 7-staking-day window, but the FK match is used as the source of
  truth rather than re-deriving it from timing.
- **manually-redeployed** if a *different* `StakePosition` exists, created by the same user, with
  `renewedFromPositionId IS NULL`, whose `startAt` falls in `(m.maturityAt, m.maturityAt + 7 staking
  days]`. This is exactly the original feasibility-doc EXISTS clause, with the `IS NULL` predicate
  added so an auto-renewed position occurring in the same window can never also be counted here.

A position can in principle satisfy both (e.g., a user manually restakes as well as having an
unrelated position auto-renew in the same window) — the three metrics below are defined so that does
not double-count within a single metric; it only means a given matured position can appear in both the
`M1-auto` and `M1-manual` numerators simultaneously if both events genuinely occurred. That is correct
behaviour: they are two different events, not one event counted twice.

### 1.2 SQL — ready to run once the auto-renew migration is live

```sql
WITH matured AS (
  SELECT id, "userId", "maturityAt", "termDays"
  FROM "StakePosition"
  WHERE status IN ('MATURED', 'PAID')
    AND "maturityAt" BETWEEN :periodStart AND :periodEnd
),
classified AS (
  SELECT
    m.id,
    m."termDays",
    EXISTS (
      SELECT 1 FROM "StakePosition" auto_nxt
      WHERE auto_nxt."renewedFromPositionId" = m.id
    ) AS auto_redeployed,
    EXISTS (
      SELECT 1 FROM "StakePosition" manual_nxt
      WHERE manual_nxt."userId" = m."userId"
        AND manual_nxt."renewedFromPositionId" IS NULL
        AND manual_nxt."startAt" > m."maturityAt"
        AND manual_nxt."startAt" <= m."maturityAt" + (:stakingDayMs * 7 * INTERVAL '1 millisecond')
    ) AS manual_redeployed
  FROM matured m
)
SELECT
  "termDays",
  COUNT(*)                                                        AS denominator,
  COUNT(*) FILTER (WHERE manual_redeployed)                       AS numerator_m1_manual,
  COUNT(*) FILTER (WHERE auto_redeployed)                         AS numerator_m1_auto,
  COUNT(*) FILTER (WHERE manual_redeployed OR auto_redeployed)    AS numerator_m1_blended,
  ROUND(COUNT(*) FILTER (WHERE manual_redeployed)::numeric
        / NULLIF(COUNT(*), 0), 4)                                 AS m1_manual_rate,
  ROUND(COUNT(*) FILTER (WHERE auto_redeployed)::numeric
        / NULLIF(COUNT(*), 0), 4)                                 AS m1_auto_rate,
  ROUND(COUNT(*) FILTER (WHERE manual_redeployed OR auto_redeployed)::numeric
        / NULLIF(COUNT(*), 0), 4)                                 AS m1_blended_rate
FROM classified
GROUP BY "termDays"
ORDER BY "termDays";
```

Bind parameters: `:periodStart`, `:periodEnd` (the measurement window), `:stakingDayMs` (must be
confirmed as `86400000` in production, not a compressed demo value — same pre-launch check named in
the feasibility doc §1, still unconfirmed by me since it also requires environment access I don't
have).

**Per-metric definitions in one line each, for anyone quoting a single number out of the table above:**

- **`M1-manual`** = `SUM(numerator_m1_manual) / SUM(denominator)` — redeployments where the new
  position has `renewedFromPositionId IS NULL`. **This is what A-core (the game) is evaluated
  against**, per ruling §3.2(a). Carries both mandatory labels (§3 below) on every readout.
- **`M1-auto`** = `SUM(numerator_m1_auto) / SUM(denominator)` — redeployments where the new position
  has `renewedFromPositionId IS NOT NULL`.
- **`M1-blended`** = `SUM(numerator_m1_blended) / SUM(denominator)` — any redeployment regardless of
  origin. The product-health number (ruling §3.2c): "is already-committed capital staying," not
  attributed to any one feature.

Report all three **stratified by `termDays`**, never pre-aggregated across it, per the feasibility
doc's own recommendation and Addendum 1 §6 step 2 (both written before the split existed, both still
binding on the stratification requirement independent of the split).

### 1.3 Prisma query shape (equivalent, if a raw-SQL-free path is preferred)

The window comparison across two position rows per user is not cleanly expressible as a single Prisma
query — it requires either `prisma.$queryRaw` with the SQL above (recommended; it is exact and
auditable) or a two-step application-level join:

```ts
// Step 1: pull matured positions in the window.
const matured = await prisma.stakePosition.findMany({
  where: {
    status: { in: ['MATURED', 'PAID'] },
    maturityAt: { gte: periodStart, lte: periodEnd },
  },
  select: { id: true, userId: true, maturityAt: true, termDays: true },
});

// Step 2: pull all candidate "next" positions once (avoid N+1) and join in memory.
const candidateNextPositions = await prisma.stakePosition.findMany({
  where: {
    userId: { in: matured.map((m) => m.userId) },
    startAt: { gt: minMaturityAt, lte: maxMaturityAtPlus7StakingDays },
  },
  select: { id: true, userId: true, startAt: true, renewedFromPositionId: true },
});
// then classify each `matured` row against `candidateNextPositions` exactly per §1.1's rules.
```

This is offered for completeness only; the SQL in §1.2 is the definition of record and should be the
one actually run, to avoid two implementations drifting apart.

---

## 2. The pre-auto-renew baseline — could not be produced this pass

### 2.1 Why today's baseline is, by definition, 100% M1-manual = M1-blended

Confirmed directly against the schema and migration history (`web/prisma/schema.prisma:224-251`,
`web/prisma/migrations/` listing): `renewedFromPositionId` does not exist yet. No auto-renew migration
has shipped. Every redeployment in the data today was a manual `POST /api/staking/stake` call. So for
the pre-auto-renew window, `M1-manual = M1-auto's complement (0) = M1-blended` trivially — there is
nothing to split yet. This is exactly the "irreplaceable" baseline R-14 is protecting: the moment the
migration deploys and any auto-renewal processes, this equivalence stops holding for good.

### 2.2 The query, as it must run against the current (pre-migration) schema

Identical to the feasibility doc §1 query (`renewedFromPositionId` cannot appear — the column doesn't
exist), stratified by `termDays`, over the full available window:

```sql
WITH matured AS (
  SELECT id, "userId", "maturityAt", "termDays"
  FROM "StakePosition"
  WHERE status IN ('MATURED', 'PAID')
    AND "maturityAt" BETWEEN '2026-06-30' AND :migrationDeployDate  -- see §2.4 on the right edge
)
SELECT
  m."termDays",
  COUNT(*) AS denominator,
  COUNT(*) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM "StakePosition" nxt
      WHERE nxt."userId" = m."userId"
        AND nxt."startAt" > m."maturityAt"
        AND nxt."startAt" <= m."maturityAt" + (:stakingDayMs * 7 * INTERVAL '1 millisecond')
    )
  ) AS numerator_redeployed,
  ROUND(
    COUNT(*) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM "StakePosition" nxt
        WHERE nxt."userId" = m."userId"
          AND nxt."startAt" > m."maturityAt"
          AND nxt."startAt" <= m."maturityAt" + (:stakingDayMs * 7 * INTERVAL '1 millisecond')
      )
    )::numeric / NULLIF(COUNT(*), 0), 4
  ) AS m1_baseline_rate
FROM matured m
GROUP BY m."termDays"
ORDER BY m."termDays";
```

This is the same query as `oil-drilling-staking-game-metric-feasibility.md` §1's reference join,
re-stated here as a GROUP BY `termDays` and bounded to end at the migration deploy date rather than an
open-ended `:periodEnd`, because §2.4 below is about maximizing this specific window correctly.

### 2.3 Status: **NOT RUN.** No database access in this environment, confirmed again.

This environment's toolset for this task is Read/Write/Grep/Glob only — no SQL client, no shell, no
Prisma Studio, no way to execute the query above against any database, production **or local dev**.
That closes off the task's suggested fallback too: I cannot produce even a labeled local-dev sanity
-check number, because I cannot query the local dev database either. This is the same constraint X1
already recorded in the feasibility doc (§3), unchanged since 2026-08-08.

**Handoff, same pattern as X1:** `prisma-db-expert` or a human with DB access must run the §2.2 query
**before the auto-renew migration deploys** and record the output (denominator, numerator, rate — per
`termDays`) as the frozen baseline. Per the feasibility doc's own finding (§2), only the 10-day and
30-day products have any `MATURED` positions yet, so expect populated rows only for those two
`termDays` values and zero-denominator rows for 90/180/360 — that is expected, not an error, and should
be recorded as such rather than omitted.

### 2.4 One timing note on "longest available window"

The task framed the window as "staking launch → today (2026-08-09)." The ruling (R-14) frames it as
"staking launch → the migration date." These are not quite the same thing, and the second is the
correct one to actually freeze: the baseline is only valid up to the instant the schema changes are
live *and* not yet exercised. Practically:

- If `prisma-db-expert`'s migration has not yet been applied to production, running §2.2 **right now**
  and running it again **immediately before deploy** would produce two slightly different, both-valid
  baseline snapshots — take the one closest to deploy, since it's strictly longer and still 100% clean.
- If the migration is applied but no auto-renewal has processed yet (there is necessarily a gap of at
  least one full term between "auto-renew ships" and "the first auto-renewal fires," since it only
  triggers at an existing position's maturity), the query is *still* safe to run post-migration and
  pre-first-processed-renewal, using the same query with `renewedFromPositionId IS NULL` added
  defensively — but there is no reason to wait for that window when running it now is free and strictly
  safer.

**Recommendation: run §2.2 now, without waiting for migration status, and re-run once more
immediately before the migration is deployed to production if any time has passed.** Whoever runs it
should record which of the two moments (or both) it corresponds to.

---

## 3. The two mandatory reporting labels — recorded and confirmed

Both labels below are hereby recorded as **mandatory, verbatim, on every future `M1-manual` figure**
this function produces — dashboards, docs, slides, tickets, or ad hoc messages. Neither label is
optional, neither may be paraphrased, and a dashboard tile too small for the full first label must use
the short form named in Addendum 1 §4.1.

### 3.1 Addendum 1 §4.1 — the correlational-only label (mandatory on every M1 figure, not just M1-manual)

> **M1 is a before/after population signal. It is not a causal estimate.** BANA Fields shipped to
> 100% of eligible users with no holdout and no exposure tracking, so any movement in maturity
> redeployment rate is measured against a pre-launch baseline and cannot be separated from concurrent
> causes — marketing activity, seasonality, staking product-mix shift, or the platform's staking
> cohort simply ageing into its first maturity window. Read it as: *"M1 was X% during this period,
> against a Y% pre-launch baseline, while BANA Fields was live."* Do **not** read it as: *"BANA Fields
> increased redeployment by Z%."*
>
> Short form for space-constrained tiles: **"correlational — see Addendum 1"**, linking to
> `docs/specs/oil-drilling-staking-game-exposure-instrumentation-ruling.md` §4.

Also binding: Addendum 1 §4.2's prohibited-word list (*caused, drove, lifted, increased, improved,
boosted, uplift from, impact of, effect of, attributable to, thanks to, resulted in, delivered, ROI
of, proves, shows that the feature, because of BANA Fields*) — none of these words may describe M1 in
any language BANA ships in, including translated readouts.

### 3.2 Ruling R-10 — the auto-renew bias label (mandatory on every `M1-manual` figure specifically, in addition to §3.1)

> *"M1-manual excludes auto-renewed positions from the numerator and auto-renew opt-ins from the
> population. Because opt-in is self-selected by the users most likely to redeploy, this measure is
> biased downward relative to its pre-auto-renew baseline by an unknown amount."*

**Confirmation:** both labels above are recorded and will be attached to every future `M1-manual`
readout this function produces, alongside the `M1-auto` / `M1-blended` context so a reader is never
shown `M1-manual` in isolation without knowing what it excludes. `M1-blended` and `M1-auto` are not
subject to R-10 (R-10 is specifically about the manual-only cut), but §3.1's correlational label is
mandatory on all three, per Addendum 1 §4.1's own scope ("any document... that reports a post-GA M1
figure").

---

## 4. R-11's 15% threshold — placeholder recorded, not revised

Ruling R-11 sets: if the share of positions maturing inside the game's 90-day window with
`autoRenew = true` exceeds **15%**, `M1-manual` is declared unreliable for sunset purposes and
escalates to `pm` instead of auto-firing the sunset clause. The ruling is explicit that 15% is `pm`'s
**placeholder**, not a computed value, and invites `growth-pm` to propose a different threshold "with
arithmetic" at power-check time.

**Status: recorded, not revised.** X1 (the power check — feasibility doc §3, Addendum 1 §6 steps 1–2)
is still open; I have no real matured-position counts, no real baseline rate, and therefore no basis
for an arithmetic argument about what share-of-opt-in threshold would make `M1-manual` statistically
unreliable versus merely diluted. Proposing a number now would repeat the exact failure mode the
ruling has twice named in this thread — a number that looks rigorous and isn't. I will revisit R-11
**only if/when X1 closes with real counts**, and only with arithmetic attached, per the ruling's own
condition. Until then, 15% stands as `pm`'s placeholder and is not being second-guessed here.

---

## 5. Confirming what is explicitly out of scope for this deliverable

Per the ruling's `growth-pm` row (§5): **gate item 3 (the auto-renew-vs-game head-to-head sizing) is
retired.** No such comparison is performed anywhere in this document, and none is planned. The old
feasibility doc §6 ("head-to-head sizing") is superseded by ruling §3.2(e)'s non-numeric answer and is
not re-opened here.

---

## 6. Summary for `pm`

| Item | Status |
|---|---|
| M1-manual / M1-auto / M1-blended query definitions | **Done** — §1, ready to run once the auto-renew migration ships. |
| Pre-auto-renew baseline freeze | **Not run — no DB access in this environment**, same constraint as X1. Exact query in §2.2, stratified by `termDays`, handoff to `prisma-db-expert`/human named in §2.3. Recommend running **now** and again immediately pre-deploy per §2.4. |
| Addendum 1 §4.1 label | Recorded, reproduced verbatim (§3.1), confirmed mandatory going forward. |
| Ruling R-10 label | Recorded, reproduced verbatim (§3.2), confirmed mandatory on every `M1-manual` figure going forward. |
| R-11 15% threshold | Recorded as `pm`'s placeholder. Not revised — X1 still open, no arithmetic basis yet. Will revisit only when X1 closes. |
| Gate item 3 (head-to-head sizing) | **Not performed**, per ruling §5 instruction. Confirmed. |

---

*Responds to `docs/specs/staking-auto-renew-ruling.md` §3.2(a)/(c), §4 (R-14), §5. Extends
`docs/specs/growth/oil-drilling-staking-game-metric-feasibility.md` (§1's window definition and §3's
X1 finding, both still open/unchanged). Reads with
`docs/specs/oil-drilling-staking-game-exposure-instrumentation-ruling.md` §4 (label source), §6 (power
check sequencing, still step 1/2 open).*
