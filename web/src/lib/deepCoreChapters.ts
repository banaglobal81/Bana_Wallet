// DEEP CORE — chapter (stratum) mapping + Phase 0 level-unlock table.
// Source: docs/specs/deep-core-01-world-bible.md §3, deep-core-02-progression-frd.md §4.2.
//
// Phase 0 scope guard (docs/specs/deep-core-00-overview-and-gate.md §6.5 Q4):
// this module intentionally contains ONLY unlock kinds with zero yield
// effect — chapter/crew/rig-silhouette/cosmetic-slot. `gear_tier_cap` and
// `mp_level` (02 §4.1 — both explicitly "수익 영향 있음(P1 게이트)") are not
// represented here at all, not even as inert/disabled entries — the P0
// sign-off (§6.5 Q4) forbids building gear/MP UI "not even a teaser".
import { LEVEL_CAP } from './deepCoreXp';

export const CHAPTER_COUNT = 6;

/** Inclusive [minLevel, maxLevel] per chapter (1-indexed chapters). */
export const CHAPTER_LEVEL_RANGES: readonly [number, number][] = Object.freeze([
  [1, 10],
  [11, 20],
  [21, 30],
  [31, 40],
  [41, 50],
  [51, LEVEL_CAP],
]);

export function chapterFromLevel(level: number): number {
  const lv = Math.min(LEVEL_CAP, Math.max(1, Math.floor(level || 1)));
  for (let i = 0; i < CHAPTER_LEVEL_RANGES.length; i += 1) {
    const [min, max] = CHAPTER_LEVEL_RANGES[i];
    if (lv >= min && lv <= max) return i + 1;
  }
  return CHAPTER_COUNT;
}

/** The crew roster (docs/specs/deep-core-01-world-bible.md §4.1). */
export const CREW_IDS = ['crew_boss', 'crew_mech', 'crew_geo', 'crew_ops', 'unit_k9'] as const;
export type CrewId = (typeof CREW_IDS)[number];

export type UnlockKind = 'chapter' | 'crew' | 'rig_silhouette' | 'cosmetic_slot' | 'depot';

export interface DeepCoreUnlock {
  level: number;
  kinds: UnlockKind[];
  /** Crew ids joining at this level (kind includes 'crew'). */
  crewIds?: CrewId[];
  /** Cosmetic slot id opened at this level (kind includes 'cosmetic_slot'). */
  cosmeticSlot?: string;
}

// Phase 0 subset of deep-core-02-progression-frd.md §4.2's full unlock table
// (gear_tier_cap rows removed per the guard above).
export const DEEP_CORE_UNLOCKS: readonly DeepCoreUnlock[] = Object.freeze([
  { level: 1, kinds: ['chapter', 'crew', 'rig_silhouette'], crewIds: ['crew_boss', 'crew_mech', 'crew_ops'] },
  { level: 3, kinds: ['depot'] },
  { level: 8, kinds: ['cosmetic_slot'], cosmeticSlot: 'crew_helmet' },
  { level: 11, kinds: ['chapter', 'crew', 'rig_silhouette'], crewIds: ['crew_geo'] },
  { level: 18, kinds: ['cosmetic_slot'], cosmeticSlot: 'rig_paint' },
  { level: 21, kinds: ['chapter', 'crew', 'rig_silhouette'], crewIds: ['unit_k9'] },
  { level: 28, kinds: ['cosmetic_slot'], cosmeticSlot: 'stratum_lighting' },
  { level: 31, kinds: ['chapter', 'rig_silhouette'] },
  { level: 38, kinds: ['cosmetic_slot'], cosmeticSlot: 'drone_skin' },
  { level: 41, kinds: ['chapter', 'rig_silhouette'] },
  { level: 48, kinds: ['cosmetic_slot'], cosmeticSlot: 'background_effect' },
  { level: 51, kinds: ['chapter', 'crew', 'rig_silhouette'] },
  { level: 60, kinds: ['cosmetic_slot'], cosmeticSlot: 'rig_plate' },
]);

/** Every crew id that has joined by (and including) `level`. */
export function unlockedCrew(level: number): CrewId[] {
  const lv = Math.min(LEVEL_CAP, Math.max(1, Math.floor(level || 1)));
  const out: CrewId[] = [];
  for (const u of DEEP_CORE_UNLOCKS) {
    if (u.level <= lv && u.crewIds) out.push(...u.crewIds);
  }
  return out;
}

/** Every cosmetic slot id opened by (and including) `level`. */
export function unlockedCosmeticSlots(level: number): string[] {
  const lv = Math.min(LEVEL_CAP, Math.max(1, Math.floor(level || 1)));
  return DEEP_CORE_UNLOCKS.filter((u) => u.level <= lv && u.cosmeticSlot).map((u) => u.cosmeticSlot as string);
}

export function isDepotUnlocked(level: number): boolean {
  return level >= 3;
}

/** Unlocks that land exactly at `level` (used to render the "Unlocked: …" list on level-up). */
export function unlocksAtLevel(level: number): DeepCoreUnlock[] {
  return DEEP_CORE_UNLOCKS.filter((u) => u.level === level);
}
