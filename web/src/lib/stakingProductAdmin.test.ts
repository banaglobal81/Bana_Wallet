// rev05 §4.6 CP-10 pure-math coverage — no DB, no mocks needed.
import { describe, expect, it } from 'vitest';
import {
  checkInterestLiabilityCap,
  isFirstTrancheTermDays,
  isValidStakingTermDays,
  STAKING_FIRST_TRANCHE_TERM_DAYS,
  STAKING_TERM_LADDER_DAYS,
  totalOpenProductsInterestLiability,
} from './stakingProductAdmin';

describe('isValidStakingTermDays', () => {
  it('accepts every rung of the §4.2 ladder', () => {
    for (const d of STAKING_TERM_LADDER_DAYS) expect(isValidStakingTermDays(d)).toBe(true);
  });
  it('rejects anything off the ladder', () => {
    for (const d of [0, 1, 7, 14, 60, 91, 200, 365, -10]) expect(isValidStakingTermDays(d)).toBe(false);
  });
});

// qa-lead FAIL fix (rev05 §4.5 CP-7′) — this helper is the single source of truth
// both products/route.ts (POST) and products/[id]/route.ts (PATCH) key off of.
describe('isFirstTrancheTermDays — CP-7′', () => {
  it('accepts exactly 10/30/90', () => {
    for (const d of STAKING_FIRST_TRANCHE_TERM_DAYS) expect(isFirstTrancheTermDays(d)).toBe(true);
  });
  it('rejects 180 and 360 (on the §4.2 ladder, but not the first tranche)', () => {
    expect(isFirstTrancheTermDays(180)).toBe(false);
    expect(isFirstTrancheTermDays(360)).toBe(false);
  });
  it('rejects anything off the ladder entirely', () => {
    expect(isFirstTrancheTermDays(45)).toBe(false);
  });
});

describe('totalOpenProductsInterestLiability', () => {
  it('matches the §4.3 CP-5′ worked example (10/30/90-day rows → Σ 9,900)', () => {
    const total = totalOpenProductsInterestLiability([
      { id: 'p10', capacity: '30000', baseDailyRatePct: '0.2', termDays: 10 },
      { id: 'p30', capacity: '20000', baseDailyRatePct: '0.5', termDays: 30 },
      { id: 'p90', capacity: '10000', baseDailyRatePct: '0.7', termDays: 90 },
    ]);
    expect(total.toFixed()).toBe('9900');
  });

  it('treats a null capacity as "0" (never NaN, never throws)', () => {
    const total = totalOpenProductsInterestLiability([{ id: 'p', capacity: null, baseDailyRatePct: '0.5', termDays: 30 }]);
    expect(total.toFixed()).toBe('0');
  });

  it('a "0"-rate / "0"-capacity row (the 180/360-day CP-7′ placeholder shape) contributes 0', () => {
    const total = totalOpenProductsInterestLiability([{ id: 'p360', capacity: '0', baseDailyRatePct: '0', termDays: 360 }]);
    expect(total.toFixed()).toBe('0');
  });
});

describe('checkInterestLiabilityCap — AC-C14', () => {
  const products = [{ id: 'p1', capacity: '30000', baseDailyRatePct: '0.2', termDays: 10 }];

  it('fails closed when the cap is unset (null), regardless of how small the projected total is', () => {
    const result = checkInterestLiabilityCap(products, null);
    expect(result.ok).toBe(false);
    expect(result.cap).toBeNull();
    expect(result.excess).toBeNull();
    expect(result.projected).toBe('600'); // 30000 * 0.2/100 * 10
  });

  it('passes when the projected total is under the configured cap', () => {
    const result = checkInterestLiabilityCap(products, '10000');
    expect(result.ok).toBe(true);
    expect(result.cap).toBe('10000');
    expect(result.excess).toBeNull();
  });

  it('passes exactly at the cap (boundary, not strictly-under)', () => {
    const result = checkInterestLiabilityCap(products, '600');
    expect(result.ok).toBe(true);
  });

  it('fails and reports the exact excess when the projected total exceeds the cap', () => {
    const result = checkInterestLiabilityCap(products, '500');
    expect(result.ok).toBe(false);
    expect(result.cap).toBe('500');
    expect(result.excess).toBe('100');
  });
});
