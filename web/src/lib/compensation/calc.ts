// Pure compensation math — no React, no server-only deps, no I/O, so both the
// API and the client can import it and it is unit-testable under vitest
// (`calc.test.ts`). Same shape as `stakingMath.ts` / `referralBonusMath.ts`.
//
// All arithmetic via decimal.js (CLAUDE.md rule 2). USD and BANA are returned
// in separate fields and are never summed — see `UserEarnings`.
import Decimal from 'decimal.js';
import type {
  BonusBreakdown,
  BonusLine,
  PackageId,
  Rank,
  RankId,
  UserEarnings,
} from '@/types/compensation-plan';
import {
  BONUSES,
  DAYS_PER_MONTH,
  FEE_ESTIMATE,
  NETWORK_SHARE,
  PACKAGES,
  PAYOUT_CAP,
  RANKS,
} from './plan';

/**
 * The disclosure that must accompany any figure produced by this module.
 * Emissions only — fee income is excluded and no future performance is implied.
 */
export const EARNINGS_DISCLAIMER =
  'Illustrative only. Shows token emission and bonus rates, not earnings. ' +
  'Fee income is $0 during network ramp-up. Earnings depend on your sales performance, ' +
  'node uptime, and network usage, and are not guaranteed.';

/** True when `id` is one of the three package ids. */
export function isPackageId(id: string): id is PackageId {
  return id === 'orbit' || id === 'solar' || id === 'interstellar';
}

/**
 * Fast Start bonus in USD: package price × 15% × quantity.
 *
 * @param packageId Which package was sold.
 * @param quantity  Number of packages sold. Negative values clamp to 0.
 * @returns USD amount as a `Decimal`.
 */
export function calculateFastStart(packageId: PackageId, quantity: number = 1): Decimal {
  const qty = new Decimal(Math.max(0, quantity));
  const fastStartRate = BONUSES[0].rate;
  return PACKAGES[packageId].price.mul(fastStartRate).mul(qty);
}

/**
 * BANA emitted over `days`: dailyBana × quantity × days.
 *
 * `dailyBana` already includes the package's slot multiplier, so slots are
 * deliberately NOT a factor here — multiplying by them again double-counts
 * (Solar would come out 50% high).
 *
 * @param packageId Which package.
 * @param quantity  Number of packages held. Negative values clamp to 0.
 * @param days      Days of emission. Defaults to a 30-day month.
 * @returns BANA token quantity as a `Decimal`. Not a dollar amount.
 */
export function calculateMonthlyEmission(
  packageId: PackageId,
  quantity: number = 1,
  days: number = DAYS_PER_MONTH,
): Decimal {
  const qty = new Decimal(Math.max(0, quantity));
  const period = new Decimal(Math.max(0, days));
  return PACKAGES[packageId].dailyBana.mul(qty).mul(period);
}

/**
 * BANA emitted per day across `quantity` packages.
 *
 * @returns BANA token quantity per day as a `Decimal`.
 */
export function calculateDailyEmission(packageId: PackageId, quantity: number = 1): Decimal {
  return calculateMonthlyEmission(packageId, quantity, 1);
}

/**
 * Full earnings picture for a package/quantity/duration.
 *
 * USD (`totalUsd`) and BANA (`totalBana`) are returned separately and must
 * never be added together for display: BANA has no official price, so a
 * combined total would assert one.
 *
 * @param packageId Which package.
 * @param quantity  Number of packages. Negative values clamp to 0.
 * @param months    Duration in 30-day months. Defaults to 1.
 */
export function calculateTotal(
  packageId: PackageId,
  quantity: number = 1,
  months: number = 1,
): UserEarnings {
  const qty = Math.max(0, quantity);
  const period = Math.max(0, months);
  const days = period * DAYS_PER_MONTH;

  const monthlyFastStart = calculateFastStart(packageId, qty);
  const fastStart = monthlyFastStart.mul(period);
  const emission = calculateMonthlyEmission(packageId, qty, days);

  return {
    packageId,
    quantity: qty,
    months: period,
    dailyEmission: calculateDailyEmission(packageId, qty),
    emission,
    monthlyFastStart,
    fastStart,
    feeEstimate: FEE_ESTIMATE,
    totalUsd: fastStart.plus(FEE_ESTIMATE),
    totalBana: emission,
    disclaimer: EARNINGS_DISCLAIMER,
  };
}

/**
 * The five bonus lines valued against a USD volume.
 *
 * `shareOfPool` normalises each rate against the 35% cap so the five values sum
 * to 100 — that is the stacked-bar geometry. The raw `percent` (15, 10, …) is
 * what gets labelled.
 *
 * @param volume USD sales volume to value the rates against.
 */
export function calculateBonusBreakdown(volume: Decimal | string | number): BonusBreakdown {
  const vol = new Decimal(volume);
  const hundred = new Decimal(100);

  const lines: BonusLine[] = BONUSES.map((bonus) => ({
    id: bonus.id,
    name: bonus.name,
    rate: bonus.rate,
    percent: bonus.rate.mul(hundred),
    amount: vol.mul(bonus.rate),
    shareOfPool: bonus.rate.div(PAYOUT_CAP).mul(hundred),
  }));

  const byId = (id: string): BonusLine => {
    const found = lines.find((line) => line.id === id);
    // BONUSES is a frozen five-element constant, so this is unreachable in practice.
    if (!found) throw new Error(`Unknown bonus id: ${id}`);
    return found;
  };

  return {
    volume: vol,
    fastStart: byId('fastStart'),
    binary: byId('binary'),
    match: byId('match'),
    rankPool: byId('rankPool'),
    globalPool: byId('globalPool'),
    lines,
    totalPayout: vol.mul(PAYOUT_CAP),
    networkShare: vol.mul(NETWORK_SHARE),
  };
}

/** The full seven-rank ladder, lowest to highest. */
export function getRankTable(): readonly Rank[] {
  return RANKS;
}

/**
 * Look up one rank.
 *
 * @param rank Rank id, case-insensitive.
 * @returns The rank, or `null` if the id is unknown.
 */
export function getRankRequirements(rank: RankId | string): Rank | null {
  const key = String(rank).toLowerCase();
  return RANKS.find((r) => r.id === key) ?? null;
}

/**
 * The rank immediately above `currentRank`.
 *
 * @returns The next rank, or `null` at Keystone (max rank) or for an unknown id.
 */
export function getNextRank(currentRank: RankId | string): Rank | null {
  const current = getRankRequirements(currentRank);
  if (!current) return null;
  return RANKS.find((r) => r.tier === current.tier + 1) ?? null;
}

/**
 * Progress from a measured value toward a requirement, as a 0–100 percent.
 *
 * @returns `null` when either side is unmeasurable; otherwise clamped to 0–100.
 */
export function progressPercent(current: Decimal | null, required: Decimal | null): Decimal | null {
  if (current === null || required === null) return null;
  if (required.lte(0)) return new Decimal(100);
  const pct = current.div(required).mul(100);
  return Decimal.min(Decimal.max(pct, 0), 100);
}

/** Format a `Decimal` as USD with thousands separators, e.g. `$2,500.00`. */
export function formatUsd(value: Decimal, decimals: number = 2): string {
  const fixed = value.toFixed(decimals, Decimal.ROUND_HALF_UP);
  const [whole, frac] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac ? `$${grouped}.${frac}` : `$${grouped}`;
}

/** Format a `Decimal` as a BANA token quantity, e.g. `36.84 BANA`. */
export function formatBana(value: Decimal, decimals: number = 2): string {
  const fixed = value.toFixed(decimals, Decimal.ROUND_HALF_UP);
  const [whole, frac] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${frac ? `${grouped}.${frac}` : grouped} BANA`;
}

/** Format a `Decimal` as a plain count with thousands separators, e.g. `1,800`. */
export function formatCount(value: Decimal): string {
  return value.toFixed(0, Decimal.ROUND_HALF_UP).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
