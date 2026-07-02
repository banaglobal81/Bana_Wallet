# BANA Staking — Daily Interest E2E Test Report

**Date:** 2026‑07‑02
**Scope:** Core staking system — *daily interest accrual & payout* (PowerPoint slides 1–4, 7).
**Environment:** Local (`localhost:3000`, PostgreSQL `bana`), worker→cron path exercised end‑to‑end.
**Result:** ✅ **6 / 6 checks passed.**

---

## 1. What was tested (per the spec)

The confirmed model in `BANA_Staking_System_blue_EN`:

- **5 fixed lock tiers** — 10 · 30 · 90 · 180 · 360 days; longer lock = higher daily rate.
- **Daily interest** on the staked amount, by tier: 0.2% / 0.5% / 0.7% / 1.0% (/ 360‑day TBD).
- **"Interest is settled and paid automatically every day."**
- Rewards funded by the exchange's fee revenue (not deposits); **no referral/multi‑level bonuses** in the core (slide 2).

> Slides 5–6 (Large/Small‑leg matching, Uni‑level boost) are marked **DRAFT / "requires separate legal review"** and are **out of scope** for this report by recommendation. They are intentionally **not** built.

## 2. What changed in the code

| Area | Change |
|---|---|
| `prisma/schema.prisma` | New **`StakingPayout`** ledger (one row per day, `@@unique([positionId, dayIndex])`); `StakePosition.paidInterest` + `daysPaid`. Migration `add_staking_payouts`. |
| `src/app/api/cron/staking/route.ts` | Rewritten to **actually pay** each elapsed unpaid day (was "Phase 2 / display only"): writes ledger rows, updates `paidInterest`/`daysPaid`, flips matured positions to `MATURED`. **Idempotent.** |
| `src/lib/stakingMath.ts` | Added `dailyInterest(principal, rate)` = `principal × rate%/100`. |
| `src/lib/staking.ts` | `serializePosition` now returns real `paidInterest` + `daysPaid`. |
| `src/app/api/staking/rewards/route.ts` | New endpoint — earned rewards per coin + recent payouts. |

**Payout formula:** `interest_for_day = principal × (dailyRatePct / 100)`, credited once per elapsed day up to `termDays`. Total at maturity = `principal × rate% × termDays`. All money via `decimal.js`.

## 3. E2E scenarios & results

Seeded the 5 tiers, created a test user, and inserted **back‑dated positions** to simulate elapsed time, then invoked the **worker → `/api/cron/staking`** and verified the DB.

Worker run #1 output: `{ processed, matured: 1, daysCredited: 20, totalPaid: "1509" }`

| Scenario | Principal | Rate | Elapsed | Days paid | Interest paid | Status | Check |
|---|---|---|---|---|---|---|---|
| 90‑day, mid‑term | 5,000 | 0.7%/day | 3 | **3** | **105** | ACTIVE | ✅ |
| 10‑day, past term | 200 | 0.2%/day | 12 → cap 10 | **10** | **4** | **MATURED** | ✅ |
| 30‑day, fresh | 1,000 | 0.5%/day | 0 | **0** | **0** | ACTIVE | ✅ |
| 180‑day | 20,000 | 1.0%/day | 7 | **7** | **1,400** | ACTIVE | ✅ |

Every value equals `principal × rate% × daysPaid`, and the number of **ledger rows** equals `daysPaid` for each position.

**Idempotency:** re‑running the worker immediately → `daysCredited: 0` (no day paid twice). ✅
**Maturity:** the past‑term position paid exactly `termDays` (10, not 12 — capped) and flipped to `MATURED`, which unlocks the principal. ✅
**Rewards ledger total:** `105 + 4 + 0 + 1,400 = ` **1,509 USDT**, matching the sum of per‑position `paidInterest`. ✅

## 4. Known gaps / follow‑ups

1. **360‑day tier rate** — not given on slide 4; used a placeholder (1.3%/day, amount 50,001–100,000) in the test. **Needs policy confirmation.**
2. **Payout → withdrawable balance** — interest is recorded in the `StakingPayout` ledger (source of truth for earned rewards). Moving it into a user's *withdrawable* Nia‑Hub balance is the next integration (business/treasury decision, since the pool is fee‑funded).
3. **MLM layers (slides 5–6)** — deliberately not built; awaiting the senior's legal/compliance decision.
4. **Stake entry point** — the E2E seeds positions directly to isolate the settlement engine; the `/api/staking/stake` route already enforces the amount brackets, capacity, and available‑balance checks (verified in code).

## 5. How to reproduce

1. Start the app with a cron secret: `CRON_SECRET=<secret> npm run dev` (in `web/`).
2. Create the 5 tier products (admin) or seed them.
3. Trigger the worker manually: `curl -X POST localhost:3000/api/cron/staking -H "x-cron-secret: <secret>"`.
4. Inspect `StakePosition.paidInterest` / `daysPaid` and `StakingPayout` rows, or `GET /api/staking/rewards`.

In production the Cloudflare Worker (`worker/`) calls the same endpoint on its daily cron schedule.

---

**Conclusion:** the core daily‑interest staking (accrual, **real daily payout**, idempotent settlement, maturity/unlock, rewards ledger) works end‑to‑end and matches the spec's math. Outstanding items are the 360‑day rate confirmation, the rewards‑withdrawal integration, and the (deferred) MLM layers.
