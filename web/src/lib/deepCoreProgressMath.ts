// DEEP CORE — Phase 0 progression derivation math. Pure, no I/O, NO
// `import 'server-only'` deliberately (mirrors this repo's existing
// referralBonus.ts / referralBonusMath.ts split) — so it's directly
// unit-testable (deepCoreProgressMath.test.ts) without mocking Prisma.
// `deepCoreProgress.ts` is the thin `server-only` I/O wrapper that fetches
// rows from the DB and calls straight into `deriveDeepCoreState` below.
//
// docs/specs/deep-core-02-progression-frd.md P-1/P-5: XP is derived ONLY from
// what the settlement worker actually paid (`StakingPayout` rows) and from
// `StakePosition` state the worker/stake route already write. There is no
// new write path here and no new Prisma model — see the handoff note in
// `deepCoreProgress.ts`.
import { xpProgress, coreLogRank, type XpProgress } from '@/lib/deepCoreXp';
import { chapterFromLevel, unlockedCrew, unlockedCosmeticSlots, isDepotUnlocked, type CrewId } from '@/lib/deepCoreChapters';

// --- M-1 (docs/specs/deep-core-00-overview-and-gate.md §6.3) ---
// `xp.charter_open` (40 XP, one-time per position) has no cap and
// `StakingProduct.minAmount` is nullable, so it can be farmed with dust
// positions and short-term cycling. Fixed here at the derivation layer
// (no schema change needed — this is a smarter READ, not a new write):
//   1. `charter_open` counts at most once per calendar settlement day,
//      regardless of how many positions were opened that day (AC-P11).
//   2. It shares `xp.lift`'s "at most 3 positions" cap: a position only
//      counts if, at the moment it opened, the user had <= 3 concurrently
//      active positions (this one included) — the 4th+ concurrently active
//      position earns 0 `charter_open` XP.
//   3. A position whose product has `minAmount == null` never counts
//      (AC-D11's XP-side analogue) — dust products can't be farmed even if
//      opened one at a time.
export const CHARTER_OPEN_XP = 40;
export const CHARTER_OPEN_MAX_CONCURRENT_ACTIVE = 3;
export const LIFT_XP_PER_DAY = 10;
export const LIFT_MAX_POSITIONS_PER_DAY = 3;
export const CHARTER_COMPLETE_XP_CAP = 300;

function dayKeyOf(d: Date, dayMs: number): number {
  return Math.floor(d.getTime() / dayMs);
}

/** `min(300, floor(10 × termDays / 3))` — deep-core-02-progression-frd.md §2. */
export function charterCompleteXp(termDays: number): number {
  return Math.min(CHARTER_COMPLETE_XP_CAP, Math.floor((10 * termDays) / 3));
}

/** `sv.charter_complete` — deep-core-03-credits-and-depot-frd.md §2.2. */
export const CHARTER_COMPLETE_SV = 50;
/** `sv.stratum` — awarded once per stratum (chapter) risen INTO (chapter 1 is the start, not a rise). */
export const STRATUM_SV = 500;
export const CORE_LOG_SV = 200;

export type PositionRow = {
  id: string;
  status: string;
  startAt: Date;
  maturityAt: Date;
  termDays: number;
  daysPaid: number;
  coin: string;
  principal: string;
  renewedFromPositionId: string | null;
  product: { minAmount: string | null };
};

export interface DeepCoreWell {
  positionId: string;
  coin: string;
  principal: string;
  termDays: number;
  status: string;
  /** Position's own term relative to the user's own longest-ever term (0..1) — never principal-based (05 AC-S12). */
  relativeSize: number;
  active: boolean;
  /** Matured < 24h ago — still rendered, "shut down" but not yet removed (05 §3.2). */
  recentlyMatured: boolean;
}

export type DeepCoreSurfaceState = 'S0_NOT_SHOWN' | 'S1_RUNNING' | 'S2_REPORTING_PAUSED' | 'S3_MAINTENANCE' | 'S4_IDLE_RIG' | 'S5_DISABLED';

export interface DeepCoreState {
  surfaceState: DeepCoreSurfaceState;
  xp: XpProgress;
  chapter: number;
  crew: CrewId[];
  cosmeticSlots: string[];
  depotUnlocked: boolean;
  operatingDays: number;
  coreLogRank: number;
  /** SV earned-to-date (derived, monotonic). No spend capability yet — see deepCoreProgress.ts header. */
  svEarned: number;
  wells: DeepCoreWell[];
  activeWellCount: number;
  lastLiftAt: string | null;
  xpBreakdown: { lift: number; charterOpen: number; charterComplete: number };
  svBreakdown: { stratum: number; charterComplete: number; coreLog: number };
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

// One global, env-based kill switch (S-5). Not admin-UI-editable yet — a
// durable `PlatformSetting.gameEnabled` toggle is part of the same schema
// handoff as the rest of this module's TODOs. Reversible: unset -> game
// surface returns exactly to its prior on-state (M-4).
export function isDeepCoreGloballyEnabled(): boolean {
  return process.env.DEEP_CORE_ENABLED !== 'false';
}

export interface DeepCorePlatformFlags {
  maintenanceMode: boolean;
  stakingWorkerEnabled: boolean;
}

export type DeepCorePayoutRow = { positionId: string; paidAt: Date };

export function emptyDeepCoreState(surfaceState: DeepCoreSurfaceState): DeepCoreState {
  const progress = xpProgress(0);
  return {
    surfaceState,
    xp: progress,
    chapter: chapterFromLevel(progress.level),
    crew: unlockedCrew(progress.level),
    cosmeticSlots: unlockedCosmeticSlots(progress.level),
    depotUnlocked: isDepotUnlocked(progress.level),
    operatingDays: 0,
    coreLogRank: 0,
    svEarned: 0,
    wells: [],
    activeWellCount: 0,
    lastLiftAt: null,
    xpBreakdown: { lift: 0, charterOpen: 0, charterComplete: 0 },
    svBreakdown: { stratum: 0, charterComplete: 0, coreLog: 0 },
  };
}

/**
 * Pure derivation core — no I/O, so it's directly unit-testable
 * (deepCoreProgressMath.test.ts) without mocking Prisma.
 */
export function deriveDeepCoreState(
  positions: PositionRow[],
  payouts: DeepCorePayoutRow[],
  settings: DeepCorePlatformFlags,
  now: Date,
  dayMs: number,
): DeepCoreState {
  if (positions.length === 0) return emptyDeepCoreState('S0_NOT_SHOWN');
  if (!isDeepCoreGloballyEnabled()) return emptyDeepCoreState('S5_DISABLED');

  // --- xp.lift + operatingDays: group payouts by settlement-day key ---
  const byDay = new Map<number, Set<string>>();
  for (const p of payouts) {
    const k = dayKeyOf(p.paidAt, dayMs);
    const set = byDay.get(k) ?? new Set<string>();
    set.add(p.positionId);
    byDay.set(k, set);
  }
  let liftXp = 0;
  for (const set of byDay.values()) liftXp += Math.min(set.size, LIFT_MAX_POSITIONS_PER_DAY) * LIFT_XP_PER_DAY;
  const operatingDays = byDay.size;
  const lastLiftAt = payouts.length > 0
    ? payouts.reduce((latest, p) => (p.paidAt.getTime() > latest.getTime() ? p.paidAt : latest), payouts[0].paidAt).toISOString()
    : null;

  // --- xp.charter_open (M-1 guarded) ---
  const charterOpenDayKeys = new Set<number>();
  for (const p of positions) {
    if (p.renewedFromPositionId != null) continue; // auto-renew successor — excluded (AC-P9)
    if (p.product.minAmount == null) continue; // M-1 #3 / AC-D11 XP analogue
    const concurrentAtOpen = positions.filter(
      (q) => q.startAt.getTime() <= p.startAt.getTime() && q.maturityAt.getTime() > p.startAt.getTime(),
    ).length;
    if (concurrentAtOpen > CHARTER_OPEN_MAX_CONCURRENT_ACTIVE) continue; // M-1 #2 — 4th+ concurrent active position
    charterOpenDayKeys.add(dayKeyOf(p.startAt, dayMs));
  }
  const charterOpenXp = charterOpenDayKeys.size * CHARTER_OPEN_XP; // M-1 #1 — one award per day, AC-P11

  // --- xp.charter_complete / sv.charter_complete ---
  let charterCompleteXpTotal = 0;
  let charterCompleteSvTotal = 0;
  for (const p of positions) {
    if (p.status !== 'ACTIVE' && p.daysPaid >= p.termDays) {
      charterCompleteXpTotal += charterCompleteXp(p.termDays);
      charterCompleteSvTotal += CHARTER_COMPLETE_SV;
    }
  }

  const xpTotal = liftXp + charterOpenXp + charterCompleteXpTotal;
  const progress = xpProgress(xpTotal);
  const chapter = chapterFromLevel(progress.level);

  // --- sv.stratum: 500 per stratum RISEN INTO (chapter 1 doesn't count) ---
  const stratumSv = Math.max(0, chapter - 1) * STRATUM_SV;
  // --- sv.core_log ---
  const rank = coreLogRank(xpTotal);
  const coreLogSv = rank * CORE_LOG_SV;
  const svEarned = stratumSv + charterCompleteSvTotal + coreLogSv;

  // --- wells (05 §3.2 — size by termDays relative to the user's own longest term, never principal) ---
  const maxTermDays = Math.max(1, ...positions.map((p) => p.termDays));
  const wells: DeepCoreWell[] = positions
    .filter((p) => p.status === 'ACTIVE' || p.maturityAt.getTime() > now.getTime() - TWENTY_FOUR_HOURS_MS)
    .map((p) => ({
      positionId: p.id,
      coin: p.coin,
      principal: p.principal,
      termDays: p.termDays,
      status: p.status,
      relativeSize: Math.min(1, p.termDays / maxTermDays),
      active: p.status === 'ACTIVE',
      recentlyMatured: p.status !== 'ACTIVE',
    }));
  const activeWellCount = positions.filter((p) => p.status === 'ACTIVE').length;

  // --- surface state (05 §4.1/§4.2) ---
  let surfaceState: DeepCoreSurfaceState = 'S1_RUNNING';
  if (settings.maintenanceMode) surfaceState = 'S3_MAINTENANCE';
  else if (!settings.stakingWorkerEnabled) surfaceState = 'S2_REPORTING_PAUSED';
  else if (activeWellCount === 0) surfaceState = 'S4_IDLE_RIG';

  return {
    surfaceState,
    xp: progress,
    chapter,
    crew: unlockedCrew(progress.level),
    cosmeticSlots: unlockedCosmeticSlots(progress.level),
    depotUnlocked: isDepotUnlocked(progress.level),
    operatingDays,
    coreLogRank: rank,
    svEarned,
    wells,
    activeWellCount,
    lastLiftAt,
    xpBreakdown: { lift: liftXp, charterOpen: charterOpenXp, charterComplete: charterCompleteXpTotal },
    svBreakdown: { stratum: stratumSv, charterComplete: charterCompleteSvTotal, coreLog: coreLogSv },
  };
}
