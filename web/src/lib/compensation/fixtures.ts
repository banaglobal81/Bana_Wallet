// Mock compensation data for the D1 (presentational) build. No API exists yet
// for rank, weak-leg CV, active slots, or binary volume — these values stand in
// so the components can be built and compliance-reviewed against real screens.
//
// Everything here is display-only. When the real endpoints land, pass a live
// `RankSnapshot` as a prop and these are bypassed entirely.
import Decimal from 'decimal.js';
import type { RankSnapshot, RequirementProgress } from '@/types/compensation-plan';
import { getNextRank, getRankRequirements, progressPercent } from './calc';

/**
 * The demo user's measured values — a Relay working toward Beacon.
 *
 * NOTE: `weeklyBinaryVolume` ($5,200) exceeds Relay's own $2,500/week binary
 * cap. It is carried as specified so the 87% progress figure renders, but the
 * plan owner should confirm whether this row measures *volume* (uncapped) or
 * *paid binary* (which cannot exceed the current rank's cap).
 */
export const FIXTURE_USER = Object.freeze({
  currentRank: 'relay' as const,
  personalCustomers: 8,
  weakLegCV: new Decimal('20000'),
  activeSlots: 100,
  weeklyBinaryVolume: new Decimal('5200'),
});

/** Fires a dev-only console warning once per component, so mock data is never mistaken for live data. */
const warnedComponents = new Set<string>();

/**
 * Warn (once, in development only) that a component is rendering fixture data.
 *
 * No-ops in production and on repeat calls, so it is safe inside an effect.
 *
 * @param componentName Component to name in the warning.
 */
export function warnFixtureUsage(componentName: string): void {
  if (process.env.NODE_ENV === 'production') return;
  if (warnedComponents.has(componentName)) return;
  warnedComponents.add(componentName);
  console.warn(
    `[compensation] ${componentName} is rendering FIXTURE data, not live values. ` +
      'Pass real props once the compensation API exists.',
  );
}

/**
 * Build a rank snapshot from measured values, computing progress toward the next rank.
 *
 * Any argument left undefined falls back to {@link FIXTURE_USER}, and the
 * returned snapshot is flagged `isFixture` unless every value was supplied.
 *
 * @param currentRank       Rank id the user currently holds.
 * @param personalCustomers Personally enrolled customers.
 * @param weakLegCV         Weaker-leg commissionable volume in USD.
 * @param activeSlots       Active slots in the organization.
 * @param weeklyBinaryVolume Weekly binary volume in USD.
 */
export function buildRankSnapshot(
  currentRank?: string,
  personalCustomers?: number,
  weakLegCV?: Decimal | string | number,
  activeSlots?: number,
  weeklyBinaryVolume?: Decimal | string | number,
): RankSnapshot {
  const isFixture =
    currentRank === undefined ||
    personalCustomers === undefined ||
    weakLegCV === undefined ||
    activeSlots === undefined;

  const rank = getRankRequirements(currentRank ?? FIXTURE_USER.currentRank)
    ?? getRankRequirements(FIXTURE_USER.currentRank);
  // getRankRequirements only returns null for unknown ids; the fallback is a known id.
  const resolvedRank = rank!;
  const nextRank = getNextRank(resolvedRank.id);

  const customers = new Decimal(personalCustomers ?? FIXTURE_USER.personalCustomers);
  const cv = new Decimal(weakLegCV ?? FIXTURE_USER.weakLegCV);
  const slots = new Decimal(activeSlots ?? FIXTURE_USER.activeSlots);
  const binary = new Decimal(weeklyBinaryVolume ?? FIXTURE_USER.weeklyBinaryVolume);

  const requirements: RequirementProgress[] = [
    buildRequirement(
      'Personal Customers',
      customers,
      nextRank ? new Decimal(nextRank.personalCustomers) : null,
      'count',
    ),
    buildRequirement('Weak-Leg CV', cv, nextRank?.weakLegCV ?? null, 'usd'),
    buildRequirement(
      'Active Slots',
      slots,
      nextRank?.activeSlots != null ? new Decimal(nextRank.activeSlots) : null,
      'count',
    ),
    buildRequirement('Binary Cap', binary, nextRank?.binaryCap ?? null, 'usdPerWeek'),
  ];

  return { currentRank: resolvedRank, nextRank, requirements, isFixture };
}

/** Assemble one requirement row, computing progress and whether it is met. */
function buildRequirement(
  label: string,
  current: Decimal | null,
  required: Decimal | null,
  format: RequirementProgress['format'],
): RequirementProgress {
  return {
    label,
    current,
    required,
    progressPercent: progressPercent(current, required),
    met: current !== null && required !== null && current.gte(required),
    format,
  };
}

/** The default fixture snapshot: Relay, ~80–91% of the way to Beacon. */
export const FIXTURE_RANK_SNAPSHOT: RankSnapshot = buildRankSnapshot();
