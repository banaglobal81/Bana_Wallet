// Pure staking math — no server-only deps, so both the API and the client can
// import it (the client recomputes accrued interest live for a ticking display).
// All money via decimal.js (CLAUDE.md rule 2).
import Decimal from 'decimal.js';

export const DAY_MS = 86_400_000;

/** Whole days elapsed since startAt (>= 0), optionally capped at `cap` (the term). */
export function daysElapsed(startAt: Date | string, now: Date = new Date(), cap?: number): number {
  const elapsed = Math.floor((now.getTime() - new Date(startAt).getTime()) / DAY_MS);
  const clamped = Math.max(0, elapsed);
  return cap != null ? Math.min(clamped, cap) : clamped;
}

/** Simple daily interest accrued so far: principal × (dailyRate%/100) × elapsedDays (capped at term). */
export function accruedInterest(
  principal: string,
  dailyRatePct: string,
  startAt: Date | string,
  termDays: number,
  now: Date = new Date(),
): Decimal {
  const days = daysElapsed(startAt, now, termDays);
  return new Decimal(principal || '0').times(new Decimal(dailyRatePct || '0').div(100)).times(days);
}

/** Interest earned for a single day: principal × (dailyRate%/100). */
export function dailyInterest(principal: string, dailyRatePct: string): Decimal {
  return new Decimal(principal || '0').times(new Decimal(dailyRatePct || '0').div(100));
}

/** Total interest over the full term (what the user earns at maturity). */
export function fullInterest(principal: string, dailyRatePct: string, termDays: number): Decimal {
  return new Decimal(principal || '0').times(new Decimal(dailyRatePct || '0').div(100)).times(termDays);
}

/** Annualized rate for display: dailyRate% × 365. */
export function aprPct(dailyRatePct: string): Decimal {
  return new Decimal(dailyRatePct || '0').times(365);
}

export function isMatured(maturityAt: Date | string, now: Date = new Date()): boolean {
  return now.getTime() >= new Date(maturityAt).getTime();
}

/** Milliseconds remaining until maturity (>= 0). */
export function msToMaturity(maturityAt: Date | string, now: Date = new Date()): number {
  return Math.max(0, new Date(maturityAt).getTime() - now.getTime());
}
