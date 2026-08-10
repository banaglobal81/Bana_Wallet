import { describe, it, expect } from 'vitest';
import { formatLedgerAmount, isZeroAmount, detectLiabilityIncidents, type LiabilityIncident } from './adminLedgerFormat';
import type { AdminStakingStat } from './adminApi';

function stat(overrides: Partial<AdminStakingStat> = {}): AdminStakingStat {
  return {
    coin: 'BANA',
    activePrincipal: '100',
    grantedActivePrincipal: '0',
    ledgeredInterest: '10',
    hubSettled: '0',
    unpaidInterest: '10',
    hubSettledStatus: 'NO_RAIL',
    dailyAccrualRate: '0.5',
    activeCount: 1,
    maturedCount: 0,
    totalCount: 1,
    settledStatusCount: 0,
    ...overrides,
  };
}

describe('isZeroAmount', () => {
  it('treats an exact "0" as zero', () => {
    expect(isZeroAmount('0')).toBe(true);
  });
  it('treats "0.00000000" as zero (N-4)', () => {
    expect(isZeroAmount('0.00000000')).toBe(true);
  });
  it('treats "-0" as zero', () => {
    expect(isZeroAmount('-0')).toBe(true);
  });
  it('treats a non-zero value as not zero', () => {
    expect(isZeroAmount('0.00000001')).toBe(false);
  });
});

describe('formatLedgerAmount', () => {
  it('renders an exact zero as "0" (N-4), never "0.00000000"', () => {
    expect(formatLedgerAmount('0')).toEqual({ display: '0', truncated: false });
    expect(formatLedgerAmount('0.00000000')).toEqual({ display: '0', truncated: false });
  });

  it('comma-groups the integer part (N-2)', () => {
    expect(formatLedgerAmount('1234567').display).toBe('1,234,567');
    expect(formatLedgerAmount('1234567.5').display).toBe('1,234,567.5');
  });

  it('truncates (never rounds) past 8 fractional digits and flags truncation (N-2/N-3)', () => {
    const r = formatLedgerAmount('1234.123456789');
    expect(r.display).toBe('1,234.12345678…');
    expect(r.truncated).toBe(true);
  });

  it('does not truncate exactly 8 fractional digits', () => {
    const r = formatLedgerAmount('1.12345678');
    expect(r.display).toBe('1.12345678');
    expect(r.truncated).toBe(false);
  });

  it('preserves a leading minus sign', () => {
    expect(formatLedgerAmount('-5.5').display).toBe('-5.5');
  });
});

describe('detectLiabilityIncidents', () => {
  it('returns no incidents for a healthy fixture', () => {
    expect(detectLiabilityIncidents([stat()])).toEqual([]);
  });

  it('flags INV-1: settledStatusCount > 0', () => {
    const incidents = detectLiabilityIncidents([stat({ settledStatusCount: 3 })]);
    expect(incidents).toContainEqual({ kind: 'paidStatus', coin: 'BANA', n: 3 } satisfies LiabilityIncident);
  });

  it('flags INV-2: negative unpaidInterest', () => {
    const incidents = detectLiabilityIncidents([stat({ unpaidInterest: '-1' })]);
    expect(incidents).toContainEqual({ kind: 'negative', coin: 'BANA' } satisfies LiabilityIncident);
  });

  it('flags INV-3: grantedActivePrincipal exceeds activePrincipal', () => {
    const incidents = detectLiabilityIncidents([stat({ activePrincipal: '100', grantedActivePrincipal: '150' })]);
    expect(incidents).toContainEqual({ kind: 'grantExceeds', coin: 'BANA' } satisfies LiabilityIncident);
  });

  it('does not flag INV-3 when granted equals active (subset, not exceeding)', () => {
    const incidents = detectLiabilityIncidents([stat({ activePrincipal: '100', grantedActivePrincipal: '100' })]);
    expect(incidents).toEqual([]);
  });
});
