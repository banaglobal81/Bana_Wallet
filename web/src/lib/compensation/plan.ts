// Frozen compensation-plan constants — the single source of truth.
//
// No rate literal (0.15, 0.409, …) may appear anywhere else in the codebase.
// Every value here is authoritative as written and is NOT derived: in
// particular the daily emission rates are 0.409 / 0.614 / 1.023 exactly, not
// `slots × 0.409`. See `calc.test.ts`, which locks these values.
//
// All money/quantity values are `Decimal` per CLAUDE.md rule 2.
import Decimal from 'decimal.js';
import type { BonusId, CompensationPackage, PackageId, Rank, RankId } from '@/types/compensation-plan';

/**
 * The three packages, keyed by id.
 *
 * `dailyBana` already accounts for the package's slots — Solar emits 0.614
 * BANA/day in total, NOT 0.614 per each of its 1.5 slots. Multiplying by
 * `slots` again is a double-count.
 */
export const PACKAGES: Readonly<Record<PackageId, CompensationPackage>> = Object.freeze({
  orbit: Object.freeze({
    id: 'orbit',
    name: 'Orbit',
    price: new Decimal('299'),
    slots: new Decimal('1'),
    dailyBana: new Decimal('0.409'),
  }),
  solar: Object.freeze({
    id: 'solar',
    name: 'Solar',
    price: new Decimal('389'),
    slots: new Decimal('1.5'),
    dailyBana: new Decimal('0.614'),
  }),
  interstellar: Object.freeze({
    id: 'interstellar',
    name: 'Interstellar',
    price: new Decimal('599'),
    slots: new Decimal('2.5'),
    dailyBana: new Decimal('1.023'),
  }),
});

/** Package ids in display order. */
export const PACKAGE_IDS: readonly PackageId[] = Object.freeze(['orbit', 'solar', 'interstellar'] as const);

/**
 * The seven ranks, lowest to highest.
 *
 * `null` = no requirement at that rank. Every rank requalifies monthly.
 */
export const RANKS: readonly Rank[] = Object.freeze([
  Object.freeze({
    id: 'operator', name: 'Operator', tier: 0,
    personalCustomers: 1, weakLegCV: null, activeSlots: null,
    binaryCap: new Decimal('300'), poolShares: null,
  }),
  Object.freeze({
    id: 'verifier', name: 'Verifier', tier: 1,
    personalCustomers: 3, weakLegCV: new Decimal('3000'), activeSlots: 15,
    binaryCap: new Decimal('900'), poolShares: null,
  }),
  Object.freeze({
    id: 'relay', name: 'Relay', tier: 2,
    personalCustomers: 6, weakLegCV: new Decimal('10000'), activeSlots: 45,
    binaryCap: new Decimal('2500'), poolShares: 1,
  }),
  Object.freeze({
    id: 'beacon', name: 'Beacon', tier: 3,
    personalCustomers: 10, weakLegCV: new Decimal('25000'), activeSlots: 110,
    binaryCap: new Decimal('6000'), poolShares: 2,
  }),
  Object.freeze({
    id: 'sentinel', name: 'Sentinel', tier: 4,
    personalCustomers: 15, weakLegCV: new Decimal('65000'), activeSlots: 300,
    binaryCap: new Decimal('15000'), poolShares: 4,
  }),
  Object.freeze({
    id: 'anchor', name: 'Anchor', tier: 5,
    personalCustomers: 25, weakLegCV: new Decimal('160000'), activeSlots: 750,
    binaryCap: new Decimal('30000'), poolShares: 7,
  }),
  Object.freeze({
    id: 'keystone', name: 'Keystone', tier: 6,
    personalCustomers: 40, weakLegCV: new Decimal('400000'), activeSlots: 1800,
    binaryCap: new Decimal('60000'), poolShares: 12,
  }),
]);

/** Static descriptive copy for one bonus line. */
export interface BonusDefinition {
  readonly id: BonusId;
  readonly name: string;
  /** Rate as a fraction — 0.15 for 15%. */
  readonly rate: Decimal;
  /** How and when it pays. Factual mechanics only — no earnings language. */
  readonly mechanics: string;
  /** Worked example on fixed numbers, or a plain statement of the rate. */
  readonly example: string;
  /** Qualification gate, or null when there is none. */
  readonly gate: string | null;
}

/**
 * The five bonus lines. Rates sum to exactly {@link PAYOUT_CAP} (35%) —
 * `calc.test.ts` asserts this, so any future rate edit that breaks the cap
 * fails CI rather than shipping.
 */
export const BONUSES: readonly BonusDefinition[] = Object.freeze([
  Object.freeze({
    id: 'fastStart', name: 'Fast Start', rate: new Decimal('0.15'),
    mechanics: 'Paid weekly on packages you personally sell. No gates, no minimum.',
    example: 'Sell 2 Orbit in a month = 2 × $44.85 = $89.70',
    gate: null,
  }),
  Object.freeze({
    id: 'binary', name: 'BANA Binary', rate: new Decimal('0.10'),
    mechanics: 'Paid weekly on weaker-leg volume, up to your rank’s weekly binary cap.',
    example: '10% of weaker-leg volume, capped weekly by rank.',
    gate: 'Requires 1 personal sale within the last 90 days.',
  }),
  Object.freeze({
    id: 'match', name: 'Team Builder Match', rate: new Decimal('0.05'),
    mechanics: 'Paid on your team’s binary earnings.',
    example: '5% of the binary paid to your team.',
    gate: 'Relay rank or higher.',
  }),
  Object.freeze({
    id: 'rankPool', name: 'Rank Pool', rate: new Decimal('0.03'),
    mechanics: 'Paid monthly from company volume, divided by pool shares held.',
    example: '3% of company volume, split across all pool shares.',
    gate: 'Relay rank or higher (1–12 shares by rank).',
  }),
  Object.freeze({
    id: 'globalPool', name: 'Global Pool', rate: new Decimal('0.02'),
    mechanics: 'Paid to the top 20 sellers by personal sales.',
    example: '2% of company volume, shared by the top 20 sellers.',
    gate: 'Top 20 by personal sales.',
  }),
]);

/** Hard cap on total payout per package sale. The five bonus rates sum to exactly this. */
export const PAYOUT_CAP = new Decimal('0.35');

/** Share of each sale retained by the network — the 65% remainder of the cap. */
export const NETWORK_SHARE = new Decimal('1').minus(PAYOUT_CAP);

/** Total BANA allocated to slot emission across the plan's life. */
export const EMISSION_POOL = new Decimal('650000000');

/** Total slots the emission pool is divided across. */
export const TOTAL_SLOTS = new Decimal('725000');

/** Lifetime BANA per slot — 650,000,000 ÷ 725,000 ≈ 896.5517. */
export const LIFETIME_BANA_PER_SLOT = EMISSION_POOL.div(TOTAL_SLOTS);

/** Days in a month for all display math. Calendar months are never used. */
export const DAYS_PER_MONTH = 30;

/** Transaction-fee income during network ramp-up. Always zero — never a projection. */
export const FEE_ESTIMATE = new Decimal('0');

/** Reference quantity for the static rate-reference table. Not user-adjustable. */
export const REFERENCE_QUANTITY = 2;
