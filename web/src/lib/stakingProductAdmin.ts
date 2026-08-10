import 'server-only';

// Admin-owned V2 staking PRODUCT logic (catalog CRUD, CP-6/CP-10) — distinct from
// web/src/lib/stakingV2.ts, which is web-shared-expert's A-4 §9 POSITION lifecycle
// contract (createStakePositionV2/maturePositionV2/runStakingSettlementV2). This
// file exists so web-admin-expert's admin/staking/products routes have a home for
// pure, unit-testable product-catalog math without reaching into that other file's
// scope (docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md §5.2
// ③ assigns products/route.ts + products/[id]/route.ts to web-admin-expert; T-5).
//
// CLAUDE.md rule 2: all amount arithmetic uses decimal.js — never Number()/parseFloat.

import Decimal from 'decimal.js';
import { fullInterest } from '@/lib/stakingMath';

// ---------------------------------------------------------------------------
// §4.2 — the term ladder every StakingProductV2 row must belong to. Carried
// forward unchanged from v1 (AUTO_RENEW_MAX_TERM_DAYS=90 is pinned to a value in
// this set, and DEEP CORE's relativeSize historically read off this ladder — see
// rev05 N-49 for why changing it is no longer a global scale break, but the set
// itself is still a deliberate, shared decision — coordinate with game-planner
// (T-12) before editing).
// ---------------------------------------------------------------------------
export const STAKING_TERM_LADDER_DAYS = [10, 30, 90, 180, 360] as const;
export type StakingTermLadderDay = (typeof STAKING_TERM_LADDER_DAYS)[number];

export function isValidStakingTermDays(termDays: number): termDays is StakingTermLadderDay {
  return (STAKING_TERM_LADDER_DAYS as readonly number[]).includes(termDays);
}

// rev05 §4.5 CP-7′ (qa-lead FAIL → route-enforced, not just a data-entry
// convention) — 1st-tranche terms allowed to actually carry a nonzero
// capacity/rate. 180/360 stay on the ladder (§4.2 — rows exist, term set
// unchanged) but this constant is the single source of truth for the
// route-level "double lock" both products/route.ts (POST) and
// products/[id]/route.ts (PATCH) enforce:
//   - POST — a 180/360-day row's capacity AND baseDailyRatePct MUST be exactly
//     "0" at creation; any other value is rejected outright, not coerced.
//   - PATCH — a 180/360-day row can never transition to OPEN (CP-7′: "1차
//     개설 범위는 10/30/90일 3종 한정" — not "may open at capacity/rate 0"),
//     and any edit that would leave its capacity or rate non-"0" is rejected,
//     independent of status.
// Also exported for the admin screen's UI (STAKING_TERM_LADDER_DAYS still
// covers all 5 rungs — an admin still has to be able to create the CP-5′
// 180/360 placeholder rows — but the create form uses this constant to
// lock/hint the rate+capacity inputs to "0" for those two terms).
export const STAKING_FIRST_TRANCHE_TERM_DAYS = [10, 30, 90] as const;
export type StakingFirstTrancheTermDay = (typeof STAKING_FIRST_TRANCHE_TERM_DAYS)[number];

export function isFirstTrancheTermDays(termDays: number): termDays is StakingFirstTrancheTermDay {
  return (STAKING_FIRST_TRANCHE_TERM_DAYS as readonly number[]).includes(termDays);
}

// ---------------------------------------------------------------------------
// CP-10 (rev05 §4.6) — product-catalog liability cap. Distinct from
// stakingV2.ts's projectedInterestLiability (which projects remaining liability
// of ACTIVE POSITIONS at stake-creation time) — this one sums the *catalog's*
// theoretical maximum across every OPEN PRODUCT, the check CP-6 requires before
// a CLOSED→OPEN transition or a capacity raise on an already-OPEN product.
// ---------------------------------------------------------------------------

export interface OpenLiabilityProductInput {
  id: string;
  capacity: string | null;
  baseDailyRatePct: string;
  termDays: number;
}

/**
 * Σ_(status=OPEN) capacity × (baseDailyRatePct / 100) × termDays — the exact
 * formula in rev05 §4.6. `fullInterest(capacity, rate, termDays)` already computes
 * one row's `principal × rate/100 × termDays`; treating `capacity` as the
 * "principal" here is intentional — capacity IS the worst-case principal the
 * product could ever hold.
 */
export function totalOpenProductsInterestLiability(openProducts: OpenLiabilityProductInput[]): Decimal {
  return openProducts.reduce(
    (sum, p) => sum.plus(fullInterest(p.capacity ?? '0', p.baseDailyRatePct, p.termDays)),
    new Decimal(0),
  );
}

export interface InterestLiabilityCapCheck {
  ok: boolean;
  projected: string;
  /** null = the cap is unset — fail-closed (rev05 §4.6 reversed-null convention), not "unlimited". */
  cap: string | null;
  /** Only meaningful when ok=false and cap is non-null. */
  excess: string | null;
}

/**
 * CP-10's decision, given the full post-update OPEN-product set (the caller is
 * responsible for substituting the row being opened/raised with its post-update
 * values BEFORE calling this — see products/[id]/route.ts). `cap == null` always
 * fails (fail-closed), regardless of the projected total — the schema-documented
 * reversed convention on PlatformSetting.maxInterestLiabilityCapBana.
 */
export function checkInterestLiabilityCap(
  openProducts: OpenLiabilityProductInput[],
  maxInterestLiabilityCapBana: string | null,
): InterestLiabilityCapCheck {
  const projected = totalOpenProductsInterestLiability(openProducts);
  if (maxInterestLiabilityCapBana == null) {
    return { ok: false, projected: projected.toFixed(), cap: null, excess: null };
  }
  const cap = new Decimal(maxInterestLiabilityCapBana);
  if (projected.gt(cap)) {
    return { ok: false, projected: projected.toFixed(), cap: cap.toFixed(), excess: projected.minus(cap).toFixed() };
  }
  return { ok: true, projected: projected.toFixed(), cap: cap.toFixed(), excess: null };
}
