// Type contracts for the BANA compensation plan UI.
//
// Every monetary / quantity field is `Decimal` (CLAUDE.md rule 2) — never
// `number`. USD amounts and BANA token quantities are kept in SEPARATE fields
// and are NEVER summed: BANA has no official price, so adding the two would
// assert a token valuation and constitute an implied income claim.
import type Decimal from 'decimal.js';

/** The three purchasable packages. */
export type PackageId = 'orbit' | 'solar' | 'interstellar';

/** The seven ranks, lowest to highest. */
export type RankId =
  | 'operator'
  | 'verifier'
  | 'relay'
  | 'beacon'
  | 'sentinel'
  | 'anchor'
  | 'keystone';

/** The five bonus lines that together make up the 35% payout cap. */
export type BonusId = 'fastStart' | 'binary' | 'match' | 'rankPool' | 'globalPool';

/**
 * A purchasable package.
 *
 * `dailyBana` ALREADY INCLUDES the slot multiplier — Solar's 0.614 is the rate
 * for all 1.5 of its slots, not per-slot. Never multiply `dailyBana × slots`;
 * `slots` is carried for rank qualification and display only.
 */
export interface CompensationPackage {
  readonly id: PackageId;
  /** Display name, e.g. "Orbit". */
  readonly name: string;
  /** Purchase price in USD. */
  readonly price: Decimal;
  /** Slot count for rank qualification / display. NOT an emission multiplier. */
  readonly slots: Decimal;
  /** BANA emitted per day for the whole package (slot multiplier included). */
  readonly dailyBana: Decimal;
}

/** Spec-compat alias for {@link CompensationPackage}. */
export type Package = CompensationPackage;

/**
 * One rung of the rank ladder.
 *
 * `null` means "no requirement at this rank" (not "unknown") and renders as an
 * em dash. Ranks requalify monthly — holding a rank is never permanent.
 */
export interface Rank {
  readonly id: RankId;
  /** Display name, e.g. "Relay". */
  readonly name: string;
  /** Zero-based position on the ladder; Operator = 0, Keystone = 6. */
  readonly tier: number;
  /** Personally enrolled customers required. */
  readonly personalCustomers: number;
  /** Weaker-leg commissionable volume required, in USD. `null` = no requirement. */
  readonly weakLegCV: Decimal | null;
  /** Active slots required across the organization. `null` = no requirement. */
  readonly activeSlots: number | null;
  /** Maximum binary payout at this rank, USD per week. */
  readonly binaryCap: Decimal;
  /** Rank-pool shares granted. `null` = does not participate. */
  readonly poolShares: number | null;
}

/** One of the five bonus lines, with its rate and the USD it yields on a given sale volume. */
export interface BonusLine {
  readonly id: BonusId;
  /** Display name, e.g. "Fast Start". */
  readonly name: string;
  /** Rate as a fraction — 0.15 for 15%. */
  readonly rate: Decimal;
  /** Rate as whole percent for display — 15 for 15%. */
  readonly percent: Decimal;
  /** USD produced by this rate against the reference volume. */
  readonly amount: Decimal;
  /** Share of the 35% payout pool, as a percent of the bar width (sums to 100). */
  readonly shareOfPool: Decimal;
}

/** The full five-line bonus split for a given USD volume. */
export interface BonusBreakdown {
  /** The USD volume the amounts were computed against. */
  readonly volume: Decimal;
  readonly fastStart: BonusLine;
  readonly binary: BonusLine;
  readonly match: BonusLine;
  readonly rankPool: BonusLine;
  readonly globalPool: BonusLine;
  /** All five lines in display order. */
  readonly lines: readonly BonusLine[];
  /** Sum of all five amounts — equals `volume × 0.35`. */
  readonly totalPayout: Decimal;
  /** The 65% remainder retained by the network. */
  readonly networkShare: Decimal;
}

/**
 * Computed earnings for a package/quantity/duration.
 *
 * `totalUsd` and `totalBana` are deliberately separate. There is no combined
 * total, and one must never be introduced.
 */
export interface UserEarnings {
  readonly packageId: PackageId;
  /** Number of packages. */
  readonly quantity: number;
  /** Duration in months (30-day months). */
  readonly months: number;
  /** BANA emitted per day across all `quantity` packages. */
  readonly dailyEmission: Decimal;
  /** BANA emitted over the full period. */
  readonly emission: Decimal;
  /** Fast Start USD on `quantity` sales, per month. */
  readonly monthlyFastStart: Decimal;
  /** Fast Start USD over the full period. */
  readonly fastStart: Decimal;
  /** Transaction-fee income. Always zero — fees are $0 during network ramp-up. */
  readonly feeEstimate: Decimal;
  /** USD total: Fast Start + fees. Contains NO token value. */
  readonly totalUsd: Decimal;
  /** BANA total. A token quantity, not a dollar amount. */
  readonly totalBana: Decimal;
  /** Mandatory disclosure to render alongside any of the above figures. */
  readonly disclaimer: string;
}

/** A user's measured value against one rank requirement, plus progress to the next rank. */
export interface RequirementProgress {
  /** Requirement label, e.g. "Personal Customers". */
  readonly label: string;
  /** The user's current value, or `null` when unmeasured. */
  readonly current: Decimal | null;
  /** What the next rank demands, or `null` at max rank. */
  readonly required: Decimal | null;
  /** Progress toward `required`, clamped to 0–100. `null` when unmeasurable. */
  readonly progressPercent: Decimal | null;
  /** True once `current >= required`. */
  readonly met: boolean;
  /** How to render the values — currency, plain count, or weekly USD cap. */
  readonly format: 'usd' | 'count' | 'usdPerWeek';
}

/** Everything `RankTracker` needs. Sourced from fixtures today; from the API later. */
export interface RankSnapshot {
  readonly currentRank: Rank;
  readonly nextRank: Rank | null;
  readonly requirements: readonly RequirementProgress[];
  /** True when the values came from fixtures rather than a live source. */
  readonly isFixture: boolean;
}
