// DEEP CORE — pure XP/level/chapter math. No I/O, no `server-only` — shared by
// the server-side derivation engine (deepCoreProgress.ts) and any client-side
// preview code.
//
// Source: docs/specs/deep-core-02-progression-frd.md §3.
//   XPToNext(L) = 5 × ceil( (10 + 3 × L^1.15) / 5 )      for L = 1 … 59
//
// §3.3 point 4 is explicit that the FORMULA is the *origin document* only —
// the runtime authority is a FROZEN 60-row constant table generated from it
// once and hand-pasted here, specifically so `Math.pow` float drift across
// Node/engine versions can never silently reclassify a user's level. Do not
// replace this literal array with a runtime `Math.pow` computation.
//
// `XP_TABLE[i]` = XP required to go from level `i + 1` to level `i + 2`
// (so `XP_TABLE[0]` is the L1→L2 cost, `XP_TABLE[58]` is the L59→L60 cost).
// The array is frozen at module load and locked byte-for-byte in
// `deepCoreXp.test.ts` (AC-P5).
export const XP_TABLE: readonly number[] = Object.freeze([
  15, 20, 25, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
  105, 110, 115, 125, 130, 135, 140, 145, 150, 155, 160, 170, 175, 180, 185,
  190, 195, 205, 210, 215, 220, 225, 235, 240, 245, 250, 260, 265, 270, 275,
  280, 290, 295, 300, 305, 315, 320, 325, 330, 340,
]);

export const LEVEL_CAP = 60;

// CUMULATIVE_XP_TABLE[i] = total XP required to REACH level (i + 2) from
// level 1 (i.e. the sum of XP_TABLE[0..i]). CUMULATIVE_XP_TABLE has 59
// entries, one per level 2..60. Level 1 requires 0 (implicit).
export const CUMULATIVE_XP_TABLE: readonly number[] = Object.freeze(
  XP_TABLE.reduce<number[]>((acc, v, i) => {
    acc.push((acc[i - 1] ?? 0) + v);
    return acc;
  }, []),
);

// Total XP to go from level 1 to level 60 (design doc's ≈9,700 figure — the
// frozen table's exact total, currently 9,840, is the authority; the design
// doc's number is an illustrative ±2% target, not a second source of truth).
export const TOTAL_XP_TO_MAX_LEVEL = CUMULATIVE_XP_TABLE[CUMULATIVE_XP_TABLE.length - 1];

/** P-3: XP never decreases, so this is a pure, monotonic lookup — no clamping surprises. */
export function levelFromXp(xpTotal: number): number {
  const xp = Math.max(0, Math.floor(xpTotal || 0));
  if (xp <= 0) return 1;
  // CUMULATIVE_XP_TABLE[i] is the XP needed to reach level i+2.
  let level = 1;
  for (let i = 0; i < CUMULATIVE_XP_TABLE.length; i += 1) {
    if (xp >= CUMULATIVE_XP_TABLE[i]) level = i + 2;
    else break;
  }
  return Math.min(LEVEL_CAP, level);
}

export interface XpProgress {
  level: number;
  /** XP earned within the current level (0 at the moment the level was reached). */
  xpIntoLevel: number;
  /** XP required to reach the next level, or `null` at the level cap (60). */
  xpForNextLevel: number | null;
  /** Total XP, unclamped — used to derive Core Log rank past level 60. */
  xpTotal: number;
}

export function xpProgress(xpTotal: number): XpProgress {
  const xp = Math.max(0, Math.floor(xpTotal || 0));
  const level = levelFromXp(xp);
  if (level >= LEVEL_CAP) {
    const xpAtCap = CUMULATIVE_XP_TABLE[CUMULATIVE_XP_TABLE.length - 1];
    return { level, xpIntoLevel: xp - xpAtCap, xpForNextLevel: null, xpTotal: xp };
  }
  const xpAtLevelStart = level === 1 ? 0 : CUMULATIVE_XP_TABLE[level - 2];
  const xpForNextLevel = XP_TABLE[level - 1];
  return { level, xpIntoLevel: xp - xpAtLevelStart, xpForNextLevel, xpTotal: xp };
}

// --- Core Log (deep-core-02-progression-frd.md §5.1) — post-L60 infinite
// cosmetic-only meta track. MP = 0, no yield effect (game.coreLog.noYield).
export const CORE_LOG_XP_PER_RANK = 2000;

/** Core Log rank (0 = not yet reached, since it only starts accruing past L60). */
export function coreLogRank(xpTotal: number): number {
  const level = levelFromXp(xpTotal);
  if (level < LEVEL_CAP) return 0;
  const xpAtCap = CUMULATIVE_XP_TABLE[CUMULATIVE_XP_TABLE.length - 1];
  const beyond = Math.max(0, Math.floor(xpTotal || 0) - xpAtCap);
  return Math.floor(beyond / CORE_LOG_XP_PER_RANK);
}
