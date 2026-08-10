import { describe, it, expect } from 'vitest';
import { XP_TABLE, CUMULATIVE_XP_TABLE, LEVEL_CAP, levelFromXp, xpProgress, coreLogRank, CORE_LOG_XP_PER_RANK } from './deepCoreXp';

// AC-P5 (docs/specs/deep-core-02-progression-frd.md §7) — "XP_TABLE은 60행
// 동결 상수이며, 테스트가 전 행의 값을 잠근다". Locks the exact frozen table
// byte-for-byte so no future edit (or Math.pow drift) can silently reclassify
// a user's level.
describe('deepCoreXp — XP_TABLE (AC-P5)', () => {
  it('has exactly 59 entries (L1→L2 … L59→L60)', () => {
    expect(XP_TABLE).toHaveLength(LEVEL_CAP - 1);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(XP_TABLE)).toBe(true);
    expect(Object.isFrozen(CUMULATIVE_XP_TABLE)).toBe(true);
  });

  it('locks every row generated from XPToNext(L) = 5 × ceil((10 + 3×L^1.15)/5)', () => {
    expect(Array.from(XP_TABLE)).toEqual([
      15, 20, 25, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
      105, 110, 115, 125, 130, 135, 140, 145, 150, 155, 160, 170, 175, 180, 185,
      190, 195, 205, 210, 215, 220, 225, 235, 240, 245, 250, 260, 265, 270, 275,
      280, 290, 295, 300, 305, 315, 320, 325, 330, 340,
    ]);
  });

  it('spec anchor points: L1→2 = 15, L59→60 = 340 (deep-core-02 §3.1)', () => {
    expect(XP_TABLE[0]).toBe(15);
    expect(XP_TABLE[XP_TABLE.length - 1]).toBe(340);
  });

  it('cumulative total to L60 is within the design doc\'s illustrative ~9,700 (±5%, since the doc itself calls its table a ±2% design target, not the frozen authority)', () => {
    const total = CUMULATIVE_XP_TABLE[CUMULATIVE_XP_TABLE.length - 1];
    expect(total).toBeGreaterThan(9200);
    expect(total).toBeLessThan(10200);
  });
});

describe('levelFromXp / xpProgress', () => {
  it('P-3 — level 1 at 0 XP, never negative', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(-100)).toBe(1);
  });

  it('crosses to level 2 exactly at the L1→2 threshold', () => {
    expect(levelFromXp(14)).toBe(1);
    expect(levelFromXp(15)).toBe(2);
  });

  it('P-4 — reaches the level cap (60) and never exceeds it, however much XP accrues', () => {
    const atCap = CUMULATIVE_XP_TABLE[CUMULATIVE_XP_TABLE.length - 1];
    expect(levelFromXp(atCap)).toBe(60);
    expect(levelFromXp(atCap + 1_000_000)).toBe(60);
  });

  it('xpProgress reports xpForNextLevel = null at the cap, and a live bar below it', () => {
    const mid = xpProgress(100);
    expect(mid.xpForNextLevel).not.toBeNull();
    expect(mid.xpIntoLevel).toBeGreaterThanOrEqual(0);
    expect(mid.xpIntoLevel).toBeLessThan(mid.xpForNextLevel as number);

    const capped = xpProgress(CUMULATIVE_XP_TABLE[CUMULATIVE_XP_TABLE.length - 1]);
    expect(capped.level).toBe(60);
    expect(capped.xpForNextLevel).toBeNull();
    expect(capped.xpIntoLevel).toBe(0);
  });
});

describe('coreLogRank (deep-core-02 §5.1 — post-L60 infinite meta track, MP = 0)', () => {
  it('is 0 before level 60', () => {
    expect(coreLogRank(100)).toBe(0);
  });

  it('increments every CORE_LOG_XP_PER_RANK beyond the L60 threshold', () => {
    const atCap = CUMULATIVE_XP_TABLE[CUMULATIVE_XP_TABLE.length - 1];
    expect(coreLogRank(atCap)).toBe(0);
    expect(coreLogRank(atCap + CORE_LOG_XP_PER_RANK - 1)).toBe(0);
    expect(coreLogRank(atCap + CORE_LOG_XP_PER_RANK)).toBe(1);
    expect(coreLogRank(atCap + CORE_LOG_XP_PER_RANK * 3 + 500)).toBe(3);
  });
});
