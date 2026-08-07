// Locks every published compensation figure. If a rate, price, or emission
// value is ever edited, these fail before the change can ship.
import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import {
  BONUSES,
  EMISSION_POOL,
  LIFETIME_BANA_PER_SLOT,
  PACKAGES,
  PAYOUT_CAP,
  RANKS,
  TOTAL_SLOTS,
} from './plan';
import {
  calculateBonusBreakdown,
  calculateDailyEmission,
  calculateFastStart,
  calculateMonthlyEmission,
  calculateTotal,
  formatBana,
  formatCount,
  formatUsd,
  getNextRank,
  getRankRequirements,
  getRankTable,
  isPackageId,
  progressPercent,
} from './calc';

describe('plan constants', () => {
  it('the five bonus rates sum to exactly the 35% hard cap', () => {
    const sum = BONUSES.reduce((acc, b) => acc.plus(b.rate), new Decimal(0));
    expect(sum.equals(PAYOUT_CAP)).toBe(true);
    expect(sum.toString()).toBe('0.35');
  });

  it('publishes the authoritative package prices, slots, and daily rates', () => {
    expect(PACKAGES.orbit.price.toString()).toBe('299');
    expect(PACKAGES.orbit.slots.toString()).toBe('1');
    expect(PACKAGES.orbit.dailyBana.toString()).toBe('0.409');

    expect(PACKAGES.solar.price.toString()).toBe('389');
    expect(PACKAGES.solar.slots.toString()).toBe('1.5');
    expect(PACKAGES.solar.dailyBana.toString()).toBe('0.614');

    expect(PACKAGES.interstellar.price.toString()).toBe('599');
    expect(PACKAGES.interstellar.slots.toString()).toBe('2.5');
    expect(PACKAGES.interstellar.dailyBana.toString()).toBe('1.023');
  });

  it('uses the authoritative daily rates rather than deriving them from slots', () => {
    // 1.5 × 0.409 = 0.6135 and 2.5 × 0.409 = 1.0225. The plan pins the rounded
    // 0.614 / 1.023 instead, so a derived value would be wrong.
    expect(PACKAGES.solar.dailyBana.equals(PACKAGES.orbit.dailyBana.mul('1.5'))).toBe(false);
    expect(PACKAGES.interstellar.dailyBana.equals(PACKAGES.orbit.dailyBana.mul('2.5'))).toBe(false);
  });

  it('divides the emission pool across total slots', () => {
    expect(EMISSION_POOL.toString()).toBe('650000000');
    expect(TOTAL_SLOTS.toString()).toBe('725000');
    expect(LIFETIME_BANA_PER_SLOT.toFixed(4)).toBe('896.5517');
  });

  it('has seven ranks in ascending tier order', () => {
    expect(RANKS).toHaveLength(7);
    RANKS.forEach((rank, index) => expect(rank.tier).toBe(index));
    expect(RANKS.map((r) => r.id)).toEqual([
      'operator', 'verifier', 'relay', 'beacon', 'sentinel', 'anchor', 'keystone',
    ]);
  });

  it('publishes the authoritative rank requirements', () => {
    const relay = getRankRequirements('relay');
    expect(relay?.personalCustomers).toBe(6);
    expect(relay?.weakLegCV?.toString()).toBe('10000');
    expect(relay?.activeSlots).toBe(45);
    expect(relay?.binaryCap.toString()).toBe('2500');
    expect(relay?.poolShares).toBe(1);

    const keystone = getRankRequirements('keystone');
    expect(keystone?.personalCustomers).toBe(40);
    expect(keystone?.weakLegCV?.toString()).toBe('400000');
    expect(keystone?.activeSlots).toBe(1800);
    expect(keystone?.binaryCap.toString()).toBe('60000');
    expect(keystone?.poolShares).toBe(12);
  });

  it('marks Operator’s absent requirements as null, not zero', () => {
    const operator = getRankRequirements('operator');
    expect(operator?.weakLegCV).toBeNull();
    expect(operator?.activeSlots).toBeNull();
    expect(operator?.poolShares).toBeNull();
    expect(getRankRequirements('verifier')?.poolShares).toBeNull();
  });
});

describe('calculateFastStart', () => {
  it('pays 15% of package price per sale', () => {
    expect(calculateFastStart('orbit', 1).toFixed(2)).toBe('44.85');
    expect(calculateFastStart('solar', 1).toFixed(2)).toBe('58.35');
    expect(calculateFastStart('interstellar', 1).toFixed(2)).toBe('89.85');
  });

  it('matches the published two-sales-per-month reference figures', () => {
    expect(calculateFastStart('orbit', 2).toFixed(2)).toBe('89.70');
    expect(calculateFastStart('solar', 2).toFixed(2)).toBe('116.70');
    expect(calculateFastStart('interstellar', 2).toFixed(2)).toBe('179.70');
  });

  it('clamps negative quantities to zero', () => {
    expect(calculateFastStart('orbit', -5).toString()).toBe('0');
  });
});

describe('calculateMonthlyEmission', () => {
  it('matches the published two-packages-over-30-days reference figures', () => {
    expect(calculateMonthlyEmission('orbit', 2, 30).toFixed(2)).toBe('24.54');
    expect(calculateMonthlyEmission('solar', 2, 30).toFixed(2)).toBe('36.84');
    expect(calculateMonthlyEmission('interstellar', 2, 30).toFixed(2)).toBe('61.38');
  });

  it('does NOT multiply by slots — dailyBana already includes them', () => {
    // The double-counting bug would return 0.614 × 1.5 × 30 = 27.63 for one Solar.
    expect(calculateMonthlyEmission('solar', 1, 30).toFixed(2)).toBe('18.42');
    expect(calculateMonthlyEmission('solar', 1, 30).toFixed(2)).not.toBe('27.63');
    expect(calculateMonthlyEmission('interstellar', 1, 30).toFixed(2)).toBe('30.69');
  });

  it('defaults to one package over a 30-day month', () => {
    expect(calculateMonthlyEmission('orbit').toFixed(2)).toBe('12.27');
  });

  it('clamps negative quantities and durations to zero', () => {
    expect(calculateMonthlyEmission('orbit', -1, 30).toString()).toBe('0');
    expect(calculateMonthlyEmission('orbit', 1, -30).toString()).toBe('0');
  });
});

describe('calculateDailyEmission', () => {
  it('returns the package daily rate times quantity', () => {
    expect(calculateDailyEmission('orbit', 1).toString()).toBe('0.409');
    expect(calculateDailyEmission('solar', 2).toString()).toBe('1.228');
    expect(calculateDailyEmission('interstellar', 2).toString()).toBe('2.046');
  });
});

describe('calculateTotal', () => {
  it('keeps USD and BANA in separate totals', () => {
    const result = calculateTotal('solar', 2, 1);
    expect(result.totalUsd.toFixed(2)).toBe('116.70');
    expect(result.totalBana.toFixed(2)).toBe('36.84');
    // The two must never be summed — 116.70 + 36.84 would assert 1 BANA = $1.
    expect(result.totalUsd.equals(result.totalBana)).toBe(false);
  });

  it('always reports zero fee income', () => {
    expect(calculateTotal('orbit', 2, 1).feeEstimate.toString()).toBe('0');
    expect(calculateTotal('interstellar', 10, 12).feeEstimate.toString()).toBe('0');
  });

  it('scales both fast start and emission across multiple months', () => {
    const result = calculateTotal('orbit', 2, 3);
    expect(result.monthlyFastStart.toFixed(2)).toBe('89.70');
    expect(result.fastStart.toFixed(2)).toBe('269.10');
    expect(result.emission.toFixed(2)).toBe('73.62');
  });

  it('carries the mandatory disclaimer', () => {
    const { disclaimer } = calculateTotal('orbit', 1, 1);
    expect(disclaimer).toContain('not guaranteed');
    expect(disclaimer).toContain('$0 during network ramp-up');
  });

  it('never uses prohibited terms in the disclaimer', () => {
    const { disclaimer } = calculateTotal('orbit', 1, 1);
    for (const term of ['investment', 'ROI', 'passive income', 'yield']) {
      expect(disclaimer.toLowerCase()).not.toContain(term.toLowerCase());
    }
  });
});

describe('calculateBonusBreakdown', () => {
  it('values each rate against the given volume', () => {
    const breakdown = calculateBonusBreakdown(PACKAGES.orbit.price);
    expect(breakdown.fastStart.amount.toFixed(2)).toBe('44.85');
    expect(breakdown.binary.amount.toFixed(2)).toBe('29.90');
    expect(breakdown.match.amount.toFixed(2)).toBe('14.95');
    expect(breakdown.rankPool.amount.toFixed(2)).toBe('8.97');
    expect(breakdown.globalPool.amount.toFixed(2)).toBe('5.98');
  });

  it('totals the five lines to exactly 35% of volume', () => {
    const breakdown = calculateBonusBreakdown('299');
    const sum = breakdown.lines.reduce((acc, l) => acc.plus(l.amount), new Decimal(0));
    expect(sum.toFixed(2)).toBe('104.65');
    expect(sum.equals(breakdown.totalPayout)).toBe(true);
  });

  it('splits volume into a 35% payout and a 65% network share', () => {
    const breakdown = calculateBonusBreakdown('1000');
    expect(breakdown.totalPayout.toFixed(2)).toBe('350.00');
    expect(breakdown.networkShare.toFixed(2)).toBe('650.00');
    expect(breakdown.totalPayout.plus(breakdown.networkShare).toFixed(2)).toBe('1000.00');
  });

  it('normalises pool shares to 100 for the stacked bar', () => {
    const breakdown = calculateBonusBreakdown('299');
    const sum = breakdown.lines.reduce((acc, l) => acc.plus(l.shareOfPool), new Decimal(0));
    expect(sum.toFixed(4)).toBe('100.0000');
    expect(breakdown.fastStart.shareOfPool.toFixed(2)).toBe('42.86');
  });

  it('exposes whole-percent labels', () => {
    const breakdown = calculateBonusBreakdown('299');
    expect(breakdown.lines.map((l) => l.percent.toString())).toEqual(['15', '10', '5', '3', '2']);
  });
});

describe('rank navigation', () => {
  it('returns the full ladder', () => {
    expect(getRankTable()).toHaveLength(7);
  });

  it('finds the next rank up', () => {
    expect(getNextRank('operator')?.id).toBe('verifier');
    expect(getNextRank('relay')?.id).toBe('beacon');
    expect(getNextRank('anchor')?.id).toBe('keystone');
  });

  it('returns null above Keystone', () => {
    expect(getNextRank('keystone')).toBeNull();
  });

  it('returns null for unknown ids', () => {
    expect(getRankRequirements('nonexistent')).toBeNull();
    expect(getNextRank('nonexistent')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(getRankRequirements('RELAY')?.id).toBe('relay');
  });
});

describe('progressPercent', () => {
  it('matches the documented fixture percentages', () => {
    expect(progressPercent(new Decimal(8), new Decimal(10))?.toFixed(0)).toBe('80');
    expect(progressPercent(new Decimal(20000), new Decimal(25000))?.toFixed(0)).toBe('80');
    expect(progressPercent(new Decimal(100), new Decimal(110))?.toFixed(0)).toBe('91');
    expect(progressPercent(new Decimal(5200), new Decimal(6000))?.toFixed(0)).toBe('87');
  });

  it('clamps above 100 and below 0', () => {
    expect(progressPercent(new Decimal(50), new Decimal(10))?.toString()).toBe('100');
    expect(progressPercent(new Decimal(-5), new Decimal(10))?.toString()).toBe('0');
  });

  it('returns null when either side is unmeasurable', () => {
    expect(progressPercent(null, new Decimal(10))).toBeNull();
    expect(progressPercent(new Decimal(10), null)).toBeNull();
  });
});

describe('formatters', () => {
  it('formats USD with thousands separators', () => {
    expect(formatUsd(new Decimal('89.7'))).toBe('$89.70');
    expect(formatUsd(new Decimal('60000'))).toBe('$60,000.00');
    expect(formatUsd(new Decimal('2500'), 0)).toBe('$2,500');
  });

  it('formats BANA with an explicit token unit', () => {
    expect(formatBana(new Decimal('36.84'))).toBe('36.84 BANA');
    expect(formatBana(new Decimal('1234.5'))).toBe('1,234.50 BANA');
  });

  it('formats plain counts', () => {
    expect(formatCount(new Decimal(1800))).toBe('1,800');
    expect(formatCount(new Decimal(45))).toBe('45');
  });
});

describe('isPackageId', () => {
  it('accepts the three package ids and rejects anything else', () => {
    expect(isPackageId('orbit')).toBe(true);
    expect(isPackageId('solar')).toBe(true);
    expect(isPackageId('interstellar')).toBe(true);
    expect(isPackageId('nebula')).toBe(false);
  });
});
