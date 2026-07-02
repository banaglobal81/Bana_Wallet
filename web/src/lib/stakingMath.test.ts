import { describe, it, expect } from 'vitest';
import {
  dailyInterest, accruedInterest, fullInterest, daysElapsed, isMatured, aprPct, DAY_MS,
} from './stakingMath';

// Harness tests for the staking money math. These numbers are the exact ones the
// payout worker credits, so they must be provably correct (CLAUDE.md rule 2 —
// decimal.js only).
describe('stakingMath', () => {
  const now = new Date('2026-01-11T00:00:00Z');
  const start = new Date('2026-01-01T00:00:00Z'); // exactly 10 days before `now`

  it('dailyInterest = principal × rate%/100', () => {
    expect(dailyInterest('5000', '0.7').toFixed()).toBe('35');   // 5000 × 0.007
    expect(dailyInterest('200', '0.2').toFixed()).toBe('0.4');   // 200 × 0.002
    expect(dailyInterest('20000', '1.0').toFixed()).toBe('200');
    expect(dailyInterest('0', '0.7').toFixed()).toBe('0');
  });

  it('daysElapsed floors, clamps ≥ 0, and caps at term', () => {
    expect(daysElapsed(start, now)).toBe(10);
    expect(daysElapsed(start, now, 5)).toBe(5);                              // capped at term
    expect(daysElapsed(now, now)).toBe(0);
    expect(daysElapsed(new Date(now.getTime() + DAY_MS), now)).toBe(0);      // future start → 0
    // 10 days minus a second is still only 9 whole days
    expect(daysElapsed(new Date(start.getTime() + 1000), now)).toBe(9);
  });

  it('accruedInterest = principal × rate%/100 × elapsedDays, capped at term', () => {
    expect(accruedInterest('5000', '0.7', start, 90, now).toFixed()).toBe('350'); // 10 days
    expect(accruedInterest('5000', '0.7', start, 5, now).toFixed()).toBe('175');  // capped at 5 days
    expect(accruedInterest('200', '0.2', start, 10, now).toFixed()).toBe('4');    // full 10-day term
  });

  it('fullInterest = principal × rate%/100 × termDays (maturity total)', () => {
    expect(fullInterest('5000', '0.7', 90).toFixed()).toBe('3150');
    expect(fullInterest('10000', '1.0', 180).toFixed()).toBe('18000');
    expect(fullInterest('100', '0.2', 10).toFixed()).toBe('2');
  });

  it('aprPct = dailyRate × 365 (display only)', () => {
    expect(aprPct('0.7').toFixed()).toBe('255.5');
    expect(aprPct('1.0').toFixed()).toBe('365');
  });

  it('isMatured compares against maturity time', () => {
    expect(isMatured(start, now)).toBe(true);
    expect(isMatured(new Date(now.getTime() + DAY_MS), now)).toBe(false);
    expect(isMatured(now, now)).toBe(true); // exactly at maturity
  });

  it('no floating-point drift on awkward rates', () => {
    // 333.33 × 0.5% × 3 = 4.99995 — must be exact, not 4.9999500000001
    expect(accruedInterest('333.33', '0.5', start, 3, new Date(start.getTime() + 3 * DAY_MS)).toFixed()).toBe('4.99995');
  });
});
