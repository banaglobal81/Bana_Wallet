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
//     EXISTING tables (StakePositionV2, StakeYieldLedgerEntry as of the A-6
//     v2-schema adapter cutover — see the block below) — zero schema risk,
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
import {
  deriveDeepCoreState, emptyDeepCoreState, isDeepCoreGloballyEnabled,
  type DeepCoreState, type DeepCorePlatformFlags,
} from '@/lib/deepCoreProgressMath';

// V2-CORE ADAPTER (docs/specs/staking-yield-system-v2-design-a6-deepcore-adapter.md).
// This file is the ONLY thing A-6 changes — the pure module
// (deepCoreProgressMath.ts) and its 19 existing tests stay byte-for-byte
// unchanged (AC-A6-1 / AC-A6-3). This adapter now reads exclusively from the
// v2 tables (StakePositionV2 / StakeYieldLedgerEntry) — CO-R1 forbids reading
// both the legacy and v2 tables together, even during the cutover window
// (A-6 §4.2).

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
  // AD-4 (single dayMs source). The v2 settlement module that owns this
  // accessor going forward does not exist yet (Q-A6-1, owner
  // web-shared-expert) — `stakingMath.ts` has NOT been deleted, so this
  // import is a deliberate, documented stopgap reuse of the still-live
  // legacy export, not a copied constant. When the v2 module lands and
  // stakingMath.ts is removed (rev03 §5.4), this import is the only line
  // that needs to change here.
  const dayMs = stakingDayMs();
  const now = new Date();

  const [positions, settings] = await Promise.all([
    prisma.stakePositionV2.findMany({
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

  // Ledger entries drive xp.lift + operatingDays. Capped fetch — 3 positions ×
  // ~650 days (the level-60 horizon, 02 §3.4) is ~1,950 rows at the design
  // ceiling; 20,000 gives ample headroom without an unbounded query.
  //
  // AD-9 (forbidden-read list, A-6 §2.4): this select is fixed at exactly
  // `{ positionId, settledAt }`. Never add `amount` / `bonusAmount` /
  // `mpSnapshot` / `bonusPctSnapshot` (or any other StakeYieldLedgerEntry /
  // StakePositionV2 / UserCoinYieldSummary / LocalLedgerEntry / UserCoinBalance
  // / PlatformSetting.stakingClaimEnabled field) to this query — reading any
  // amount-bearing column here would make game progress principal-proportional
  // (DC-3) or leak the claim surface into the game state machine (C-7).
  const ledgerEntries = await prisma.stakeYieldLedgerEntry.findMany({
    where: { userId },
    orderBy: { settledAt: 'desc' },
    take: 20_000,
    select: { positionId: true, settledAt: true },
  });

  // AD-1 (confirmed): repack settledAt -> paidAt at this adapter boundary so
  // deriveDeepCoreState's pure module and its 19 tests stay byte-for-byte
  // unchanged. The field-name hygiene rename (paidAt -> settledAt inside the
  // pure module) is deliberately deferred to a separate step-3 commit
  // (A-6 §2.2 AD-1) — this line is the entire scope of that deferral.
  const payouts = ledgerEntries.map((r) => ({ positionId: r.positionId, paidAt: r.settledAt }));

  // AD-5 (confirmed): map to the v2 worker flag explicitly via a narrowed
  // object literal — never pass `settings` through by structural typing, and
  // never combine stakingV2WorkerEnabled with the legacy stakingWorkerEnabled
  // via && / ||. The pure module's field name `stakingWorkerEnabled` stays a
  // game-domain term ("is the worker that writes MY rows on") — it is not the
  // legacy platform flag.
  const flags: DeepCorePlatformFlags = {
    maintenanceMode: settings.maintenanceMode,
    stakingWorkerEnabled: settings.stakingV2WorkerEnabled,
  };

  return deriveDeepCoreState(positions, payouts, flags, now, dayMs);
}
