// Mock compensation data for the D1 (presentational) build. No API exists yet
// for rank, weak-leg CV, or active slots — these values stand in so the
// components can be built and compliance-reviewed against real screens.
//
// Everything here is display-only. When the real endpoints land, build a
// RankSnapshot from live values and pass it in; these are bypassed entirely.
import Decimal from 'decimal.js';
import type { RankSnapshot, RequirementProgress } from '@/types/compensation-plan';
import { getNextRank, getRankRequirements, progressPercent } from './calc';

/**
 * The demo user: a Relay who has just met Relay's own thresholds and is
 * working toward Beacon (10 customers / $25,000 CV / 110 slots).
 *
 * Binary cap is intentionally absent. It is a payout ceiling defined by rank —
 * read from `RANKS` via `getRankRequirements()` — not a value a user
 * accumulates, so it is neither stored here nor shown as progress.
 */
export const mockRelayUser = Object.freeze({
  currentRank: 'relay' as const,
  /** 6 of Beacon's 10 → 60% */
  personalCustomers: 6,
  /** $10,000 of Beacon's $25,000 → 40% */
  weakLegCV: new Decimal('10000'),
  /** 45 of Beacon's 110 → 41% */
  activeSlots: 45,
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
      'Pass a real RankSnapshot once the compensation API exists.',
  );
}

/**
 * Build a {@link RankSnapshot} from measured values, computing progress toward
 * the next rank for the three measurable requirements.
 *
 * Any argument left undefined falls back to {@link mockRelayUser}, and the
 * snapshot is flagged `isFixture` unless every value was supplied.
 *
 * @param currentRank       Rank id the user currently holds.
 * @param personalCustomers Personally enrolled customers.
 * @param weakLegCV         Weaker-leg commissionable volume in USD.
 * @param activeSlots       Active slots in the organization.
 */
export function buildRankSnapshot(
  currentRank?: string,
  personalCustomers?: number,
  weakLegCV?: Decimal | string | number,
  activeSlots?: number,
): RankSnapshot {
  const isFixture =
    currentRank === undefined ||
    personalCustomers === undefined ||
    weakLegCV === undefined ||
    activeSlots === undefined;

  // Falls back to a known-good id, so the lookup cannot fail.
  const resolvedRank =
    getRankRequirements(currentRank ?? mockRelayUser.currentRank) ??
    getRankRequirements(mockRelayUser.currentRank)!;
  const nextRank = getNextRank(resolvedRank.id);

  const customers = new Decimal(personalCustomers ?? mockRelayUser.personalCustomers);
  const cv = new Decimal(weakLegCV ?? mockRelayUser.weakLegCV);
  const slots = new Decimal(activeSlots ?? mockRelayUser.activeSlots);

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

/** The default fixture snapshot: Relay, 60% / 40% / 41% of the way to Beacon. */
export const FIXTURE_RANK_SNAPSHOT: RankSnapshot = buildRankSnapshot();
