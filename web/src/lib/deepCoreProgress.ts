import 'server-only';
// DEEP CORE — Phase 0 progression I/O wrapper.
//
// All derivation logic lives in `deepCoreProgressMath.ts` (pure, no I/O, no
// `server-only` guard — directly unit-tested there). This file is only the
// Prisma fetch + the `server-only` boundary, re-exporting the math module's
// types for callers (e.g. the positions route) that only need this file.
//
// SCHEMA HANDOFF (docs/specs/deep-core-p0-schema-handoff.md): the full FRD
// (02 §6, 03 §6) specs a persisted `GameProfile` / `GameXpEntry` /
// `GameLedgerEntry` for O(1) reads, `xp.presence`, and *spendable* SV
// (cosmetics purchase + ownership). Per CLAUDE.md rule 7 and this task's
// explicit instruction, `game-developer` does not add Prisma models or run
// migrations — that is `prisma-db-expert`'s area. Until that lands:
//   - level/chapter/XP/operating-days/wells are fully derived here from
//     EXISTING tables (StakePosition, StakingPayout) — zero schema risk,
//     works today.
//   - `xp.presence` (needs a per-day idempotent write) is NOT implemented
//     yet — it is at most 33% of one day's XP (02 §2) and its absence does
//     not block level-up, chapter, or the visual layer.
//   - SV is reported as an EARNED-TO-DATE total (derived, monotonic, safe to
//     recompute on every read) with no spend capability yet — the Outfitting
//     shop is read/browse-only until `GameLedgerEntry` exists to record a
//     purchase. See `docs/specs/deep-core-p0-schema-handoff.md`.
import { prisma } from '@/lib/db';
import { stakingDayMs } from '@/lib/stakingMath';
import { getPlatformSettings } from '@/lib/platformSettings';
import { deriveDeepCoreState, emptyDeepCoreState, isDeepCoreGloballyEnabled, type DeepCoreState } from '@/lib/deepCoreProgressMath';

export type {
  DeepCoreState, DeepCoreSurfaceState, DeepCoreWell, DeepCorePlatformFlags, DeepCorePayoutRow, PositionRow,
} from '@/lib/deepCoreProgressMath';
export {
  deriveDeepCoreState, emptyDeepCoreState, isDeepCoreGloballyEnabled,
  CHARTER_OPEN_XP, CHARTER_OPEN_MAX_CONCURRENT_ACTIVE, LIFT_XP_PER_DAY, LIFT_MAX_POSITIONS_PER_DAY,
  CHARTER_COMPLETE_XP_CAP, CHARTER_COMPLETE_SV, STRATUM_SV, CORE_LOG_SV, charterCompleteXp,
} from '@/lib/deepCoreProgressMath';

/**
 * Derive the full Phase 0 game state for one user from existing tables only.
 * Safe to call on every page load — every value here is a pure function of
 * rows the settlement worker / stake route already wrote (P-1/P-5).
 */
export async function getDeepCoreState(userId: string): Promise<DeepCoreState> {
  const dayMs = stakingDayMs();
  const now = new Date();

  const [positions, settings] = await Promise.all([
    prisma.stakePosition.findMany({
      where: { userId },
      orderBy: { startAt: 'asc' },
      select: {
        id: true, status: true, startAt: true, maturityAt: true, termDays: true, daysPaid: true,
        coin: true, principal: true, renewedFromPositionId: true,
        product: { select: { minAmount: true } },
      },
    }),
    getPlatformSettings(),
  ]);

  if (positions.length === 0) return emptyDeepCoreState('S0_NOT_SHOWN');
  if (!isDeepCoreGloballyEnabled()) return emptyDeepCoreState('S5_DISABLED');

  // Payouts drive xp.lift + operatingDays. Capped fetch — 3 positions ×
  // ~650 days (the level-60 horizon, 02 §3.4) is ~1,950 rows at the design
  // ceiling; 20,000 gives ample headroom without an unbounded query.
  const payouts = await prisma.stakingPayout.findMany({
    where: { userId },
    orderBy: { paidAt: 'desc' },
    take: 20_000,
    select: { positionId: true, paidAt: true },
  });

  return deriveDeepCoreState(positions, payouts, settings, now, dayMs);
}
