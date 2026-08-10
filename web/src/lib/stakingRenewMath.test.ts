import { describe, it, expect } from 'vitest';
import { decideRenewalEligibility, AUTO_RENEW_MAX_TERM_DAYS, type RenewalEligibilityInput } from './stakingRenewMath';

// Pure eligibility-decision logic only (no Prisma/DB). The check set/order
// here is no longer a reconstruction — it is settled by
// docs/specs/staking-auto-renew-assumption-ruling.md (`pm`, AUTHORITATIVE
// RULING, 2026-08-10), which adjudicated every ASSUMPTION marker that used to
// be in stakingRenewMath.ts. See that document for the reasoning behind the
// check order and the A2-C1/A3-C1 scope widenings covered below.
function baseInput(overrides: Partial<RenewalEligibilityInput> = {}): RenewalEligibilityInput {
  return {
    userDisabled: false,
    grantedByAdminId: null,
    positionTermDays: 30,
    positionPrincipal: '1000',
    positionDailyRatePct: '0.05',
    positionCoin: 'USDT',
    productStatus: 'OPEN',
    productTermDays: 30,
    productDailyRatePct: '0.05',
    productCoin: 'USDT',
    productMinAmount: null,
    productMaxAmount: null,
    productCapacity: null,
    productActivePrincipalExcludingSelf: '0',
    ...overrides,
  };
}

describe('decideRenewalEligibility', () => {
  it('returns null (eligible) when every check passes', () => {
    expect(decideRenewalEligibility(baseInput())).toBeNull();
  });

  it('AUTO_RENEW_MAX_TERM_DAYS is the 90-day cap', () => {
    expect(AUTO_RENEW_MAX_TERM_DAYS).toBe(90);
  });

  it('refuses a disabled account first, regardless of other failures', () => {
    const r = decideRenewalEligibility(
      baseInput({ userDisabled: true, grantedByAdminId: 'admin-1', positionTermDays: 999 }),
    );
    expect(r).toBe('FAILED_ACCOUNT_INACTIVE');
  });

  it('refuses a granted position', () => {
    expect(decideRenewalEligibility(baseInput({ grantedByAdminId: 'admin-1' }))).toBe('FAILED_GRANTED_POSITION');
  });

  it('boundary: termDays === 90 is eligible, 91 is refused (E2a)', () => {
    expect(
      decideRenewalEligibility(baseInput({ positionTermDays: 90, productTermDays: 90 })),
    ).toBeNull();
    expect(
      decideRenewalEligibility(baseInput({ positionTermDays: 91, productTermDays: 91 })),
    ).toBe('FAILED_TERM_TOO_LONG');
  });

  it('E2a (cap) fires before E3 (closed) and E4 (rate) — AC-29', () => {
    const r = decideRenewalEligibility(
      baseInput({
        positionTermDays: 91,
        productTermDays: 91,
        productStatus: 'CLOSED',
        productDailyRatePct: '0.01', // also a rate-lowering
      }),
    );
    expect(r).toBe('FAILED_TERM_TOO_LONG');
  });

  it('refuses a closed product', () => {
    expect(decideRenewalEligibility(baseInput({ productStatus: 'CLOSED' }))).toBe('FAILED_PRODUCT_CLOSED');
  });

  it('refuses only a STRICTLY lower rate — equal or higher rate renews', () => {
    expect(decideRenewalEligibility(baseInput({ productDailyRatePct: '0.04' }))).toBe('FAILED_RATE_LOWERED');
    expect(decideRenewalEligibility(baseInput({ productDailyRatePct: '0.05' }))).toBeNull();
    expect(decideRenewalEligibility(baseInput({ productDailyRatePct: '0.060' }))).toBeNull();
    // decimal.js precision — "0.050" must equal "0.05" (CLAUDE.md rule 2).
    expect(decideRenewalEligibility(baseInput({ productDailyRatePct: '0.050' }))).toBeNull();
  });

  it('refuses below the current minimum', () => {
    expect(decideRenewalEligibility(baseInput({ productMinAmount: '1001' }))).toBe('FAILED_BELOW_MIN');
    expect(decideRenewalEligibility(baseInput({ productMinAmount: '1000' }))).toBeNull();
  });

  it('refuses above the current maximum', () => {
    expect(decideRenewalEligibility(baseInput({ productMaxAmount: '999' }))).toBe('FAILED_ABOVE_MAX');
    expect(decideRenewalEligibility(baseInput({ productMaxAmount: '1000' }))).toBeNull();
  });

  it('refuses when restaking would exceed product capacity', () => {
    expect(
      decideRenewalEligibility(
        baseInput({ productCapacity: '1500', productActivePrincipalExcludingSelf: '600' }),
      ),
    ).toBe('FAILED_CAPACITY'); // 600 + 1000 = 1600 > 1500
    expect(
      decideRenewalEligibility(
        baseInput({ productCapacity: '1600', productActivePrincipalExcludingSelf: '600' }),
      ),
    ).toBeNull(); // exactly at capacity is fine
  });

  it('refuses when the product term length no longer matches the position (defensive E8)', () => {
    expect(decideRenewalEligibility(baseInput({ productTermDays: 60 }))).toBe('FAILED_TERMS_CHANGED');
  });

  // A2-C1 (ruling §2): E8 must also fire on a `coin` mismatch — `coin` is a
  // position snapshot carried forward unchanged onto the successor, exactly
  // like `termDays`.
  it('refuses when the product coin no longer matches the position (A2-C1, defensive E8)', () => {
    expect(decideRenewalEligibility(baseInput({ productCoin: 'BANA' }))).toBe('FAILED_TERMS_CHANGED');
  });

  it('coin mismatch alone (term unchanged) still trips E8, not silently ignored', () => {
    expect(
      decideRenewalEligibility(baseInput({ positionCoin: 'USDT', productCoin: 'BUSD', productTermDays: 30, positionTermDays: 30 })),
    ).toBe('FAILED_TERMS_CHANGED');
  });
});
