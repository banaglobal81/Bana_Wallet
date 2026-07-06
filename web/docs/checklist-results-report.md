# BANA Wallet — Checklist Results Report

**Date:** 2026-07-06
**Scope:** David's test checklist (staking daily payout, MLM commission, manual verification).
**Environment:** Local, accelerated test clock (5 min = 1 day) with real settlement runs; BANA-only.

---

## Summary

| # | Item | AI check | Manual (hand) check | Status |
|---|------|----------|---------------------|--------|
| 1 | Staking interest paid at 5-minute intervals | ✅ 11/11 intervals correct | ✅ matches (100 BANA at maturity) | **PASS** |
| 2 | Commission paid per the MLM structure | ✅ live + unit + integration | ✅ matches (4.04/day, 24.24 total) | **PASS** |
| 3 | AI checks **and** manual calculation both confirm | ✅ | ✅ | **PASS** |

All three items verified. Items still **open** are decisions/ops (not code): see "Open items" at the end.

---

## Item 1 — Staking daily interest (5-minute payout)

**Test stake:** 5,000 BANA · 10-Day product · 0.2%/day · clock set so 5 min = 1 day.
**Method:** ran the real settlement every 5 real minutes for 50 minutes (to maturity).

**Formula:** `interest = stake × rate ÷ 100 × days = 5000 × 0.2 ÷ 100 × days = 10 × days`

| Real time | Day | Hand calc (10 × day) | System paid | Match |
|---|---|---|---|---|
| 0:00 | 0 | 0 | 0 | ✅ |
| 5 min | 1 | 10 | 10 | ✅ |
| 10 min | 2 | 20 | 20 | ✅ |
| 15 min | 3 | 30 | 30 | ✅ |
| 25 min | 5 | 50 | 50 | ✅ |
| 50 min | 10 | 100 | **100 → MATURED** | ✅ |

**Ledger:** exactly 10 payout rows × 10 BANA = 100 BANA; no double-pays; matured on time.
**Result: PASS.** Interest pays correctly at 5-minute intervals and equals the hand calculation.

---

## Item 2 — MLM commission (대·소실적 매칭 + 유니레벨 부스트)

**Test tree (BANA):**
```
        U  ← earns commission
      / | \
     A  B  C     A = 10,000 @0.5% → 50/day
     |            B =  5,000 @0.2% → 10/day
     A1           C =  5,000 @0.2% → 10/day
                  A1 = 4,000 @0.2% →  8/day
```
**Method:** MLM engine turned ON + 5 min = 1 day; ran settlement every 5 min for 6 daily cycles.

### Hand calculation for U (per day)
**Layer 1 (Small-leg Matching):**
- Lines: A = 10,000+4,000 = 14,000 (biggest → ignored) · B = 5,000 · C = 5,000
- Small-leg (B+C) volume = 10,000 → level **B2 = 1.5%**
- Small-leg daily interest = 10 + 10 = 20
- Layer 1 = `1.5% × 20` = **0.3**

**Layer 2 (Uni-level Boost):** 3 direct referrals → generations 1,2,3 active
- Gen 1 (A+B+C) = 70 × 5% = 3.5
- Gen 2 (A1) = 8 × 3% = 0.24
- Gen 3 = 0
- Layer 2 = **3.74**

**Total = 0.3 + 3.74 = 4.04 BANA/day**

### Live result vs hand calc
| Time | Day | Hand (4.04 × day) | System (U) | Match |
|---|---|---|---|---|
| 16:07 | 1 | 4.04 | 4.04 | ✅ |
| 16:12 | 2 | 8.08 | 8.08 | ✅ |
| 16:17 | 3 | 12.12 | 12.12 | ✅ |
| 16:22 | 4 | 16.16 | 16.16 | ✅ |
| 16:27 | 5 | 20.20 | 20.20 | ✅ |
| 16:32 | 6 | 24.24 | 24.24 | ✅ |

- Every daily ledger row: layer1 = 0.3, layer2 = 3.74, total = 4.04.
- Upline **A** also correctly paid its own commission (0.4/day → 2.4) — pays at every level.
- Base staking interest accrued at the same time (A: 50/day → 250 by day 5).
- Idempotent (one row per day); with the flag OFF, nothing is paid.

**Result: PASS.** Commission pays per the deck's structure and equals the hand calculation.

---

## Item 3 — AI + manual verification

Per the checklist, both an automated check **and** a manual (calculator) check were done for items 1 and 2, and both agree:

- **Item 1:** hand calc `10 × days` → 10/30/50/100 = system. ✅
- **Item 2:** hand calc `0.3 + 3.74 = 4.04/day`, `4.04 × 6 = 24.24` = system. ✅

**Result: PASS.**

---

## Reference tables (for verifying any future numbers)

**Staking daily rates:** 10-Day 0.2% · 30-Day 0.5% · 90-Day 0.7% · 180-Day 1.0% · 360-Day 1.3% (placeholder).

**Layer 1 — Small-leg match (thresholds in BANA):**
| Level | Min | % | | Level | Min | % |
|---|---|---|---|---|---|---|
| B1 | 3,000 | 1.0 | | B6 | 700,000 | 4.5 |
| B2 | 10,000 | 1.5 | | B7 | 1,500,000 | 5.5 |
| B3 | 30,000 | 2.0 | | B8 | 3,000,000 | 6.6 |
| B4 | 100,000 | 2.8 | | B9 | 7,000,000 | 8.0 |
| B5 | 300,000 | 3.6 | | B10 | 15,000,000 | 10.0 |

**Layer 2 — Uni-level boost per generation (1→10):** 5% · 3% · 3% · 3% · 2% · 2% · 2% · 2% · 3% · 5% (cumulative cap 30%). A direct referral counts once they stake ≥ 200 BANA.

**Formulas:**
```
Interest  = stake × rate ÷ 100 × days
Layer 1   = (small-leg %) × (small-leg daily interest)
Layer 2   = Σ (generation g boost %) × (generation g daily interest),  g = 1 .. direct-referral count
Commission = Layer 1 + Layer 2   (paid daily, BANA)
```

---

## Open items (not code — needed before production launch)

1. **Confirm the uni-level base** with the senior (assumption used: each generation's daily interest).
2. **Legal / regulatory sign-off** on the MLM (the deck marks it DRAFT · requires review). The engine stays OFF (`REFERRAL_BONUS_ENABLED=false`) until then.
3. **Credit earnings to real withdrawable balance** — interest and commission are currently recorded in ledgers but not yet moved into a user's spendable balance (applies to both).
4. **Deploy the daily cron worker** so payouts run automatically in production.
5. **End-to-end real journey test** (signup with referral → stake → interest → commission → withdraw).

---

**Conclusion:** Checklist items 1, 2, and 3 all PASS — the daily interest and the MLM commission pay correctly and match manual calculation. Remaining work to go live is operational/decision-based (items above), not correctness of the engine.
