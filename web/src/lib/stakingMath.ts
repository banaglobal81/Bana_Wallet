// Pure staking math — no server-only deps, so both the API and the client can
// import it (the client recomputes accrued interest live for a ticking display).
// All money via decimal.js (CLAUDE.md rule 2).
import Decimal from 'decimal.js';

export const DAY_MS = 86_400_000;

/**
 * The length of "one staking day" in ms. Defaults to a real 24h day. For
 * TESTING / DEMO ONLY it can be shortened (e.g. 5 minutes = 1 day) so a full
 * multi-day payout cycle can be observed in minutes. Set via env:
 *   - `NEXT_PUBLIC_STAKING_DAY_MS` — read on BOTH server and browser (keeps the
 *     live display in sync with the payout engine), OR
 *   - `STAKING_DAY_MS` — server-only fallback.
 * Unset / invalid → a real day. PRODUCTION MUST LEAVE THIS UNSET.
 */
export function stakingDayMs(): number {
  const raw =
    (typeof process !== 'undefined' && process.env
      ? process.env.NEXT_PUBLIC_STAKING_DAY_MS || process.env.STAKING_DAY_MS
      : '') || '';
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DAY_MS;
}

/** Whole days elapsed since startAt (>= 0), optionally capped at `cap` (the term). */
export function daysElapsed(
  startAt: Date | string,
  now: Date = new Date(),
  cap?: number,
  dayMs: number = stakingDayMs(),
): number {
  const elapsed = Math.floor((now.getTime() - new Date(startAt).getTime()) / dayMs);
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
