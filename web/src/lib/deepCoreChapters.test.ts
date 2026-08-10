import { describe, it, expect } from 'vitest';
import { chapterFromLevel, unlockedCrew, unlockedCosmeticSlots, isDepotUnlocked, unlocksAtLevel, DEEP_CORE_UNLOCKS } from './deepCoreChapters';

describe('chapterFromLevel — 6 strata over 60 levels (deep-core-01 §3)', () => {
  it.each([
    [1, 1], [10, 1], [11, 2], [20, 2], [21, 3], [30, 3],
    [31, 4], [40, 4], [41, 5], [50, 5], [51, 6], [60, 6],
  ])('level %i -> chapter %i', (level, chapter) => {
    expect(chapterFromLevel(level)).toBe(chapter);
  });

  it('clamps out-of-range input', () => {
    expect(chapterFromLevel(0)).toBe(1);
    expect(chapterFromLevel(999)).toBe(6);
  });
});

describe('DEEP_CORE_UNLOCKS — Phase 0 scope guard (00 §6.5 Q4)', () => {
  it('contains no gear/MP related unlock kinds — only visual/zero-yield kinds', () => {
    const allowedKinds = new Set(['chapter', 'crew', 'rig_silhouette', 'cosmetic_slot', 'depot']);
    for (const u of DEEP_CORE_UNLOCKS) {
      for (const kind of u.kinds) expect(allowedKinds.has(kind)).toBe(true);
    }
  });
});

describe('unlockedCrew — matches deep-core-02 §4.2 unlock levels', () => {
  it('boss/mech/ops join at level 1', () => {
    expect(unlockedCrew(1).sort()).toEqual(['crew_boss', 'crew_mech', 'crew_ops'].sort());
  });

  it('geologist joins at 11 (Phase 0 unlock table) and K-9 at 21', () => {
    expect(unlockedCrew(10)).not.toContain('crew_geo');
    expect(unlockedCrew(11)).toContain('crew_geo');
    expect(unlockedCrew(20)).not.toContain('unit_k9');
    expect(unlockedCrew(21)).toContain('unit_k9');
  });

  it('never decreases as level rises (P-3 analogue for unlocks)', () => {
    const at21 = unlockedCrew(21);
    const at60 = unlockedCrew(60);
    for (const id of at21) expect(at60).toContain(id);
  });
});

describe('unlockedCosmeticSlots / isDepotUnlocked', () => {
  it('depot opens at level 3, not before', () => {
    expect(isDepotUnlocked(2)).toBe(false);
    expect(isDepotUnlocked(3)).toBe(true);
  });

  it('cosmetic slots accumulate at 8/18/28/38/48/60', () => {
    expect(unlockedCosmeticSlots(7)).toEqual([]);
    expect(unlockedCosmeticSlots(8)).toEqual(['crew_helmet']);
    expect(unlockedCosmeticSlots(60)).toHaveLength(6);
  });
});

describe('unlocksAtLevel — used for the one-time "Unlocked: …" list on chapter transitions', () => {
  it('is empty for a level with no unlock row', () => {
    expect(unlocksAtLevel(2)).toEqual([]);
  });

  it('returns exactly the rows landing on that level', () => {
    const at11 = unlocksAtLevel(11);
    expect(at11).toHaveLength(1);
    expect(at11[0].kinds).toContain('chapter');
  });
});
