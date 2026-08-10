// DEEP CORE — real-asset manifest lookup
// (docs/specs/deep-core-08-asset-manifest-phase0-batch1.md, superseding the
// original atlas-contract placeholder plan this file used to describe).
//
// `game-designer` ships finished art as flat PNGs under
// web/public/game/deep-core/, indexed by web/public/game/deep-core/manifest.json
// (33/431 generated so far — see the handoff doc's §6 backlog for what's
// still pending). This module is the ONLY place that reads manifest.json —
// every resolver below returns `undefined` when an id isn't in the manifest
// yet, so every call site (DeepCoreScene, DeepCoreHud, DeepCoreControlBar,
// CrewSheet) always has a defined procedural/icon-library fallback instead
// of a broken image. No asset id or path is ever hardcoded outside this
// file: new batches land by `game-designer` dropping files under
// web/public/game/deep-core/ and appending to manifest.json — zero code
// change here or at any call site.
//
// L-5 (kept from the prior version of this file): only ever imported from
// the dynamically-imported canvas bundle or from components already behind
// the S-0/hide gate — see DeepCoreEmbed.tsx.
import manifestData from '../../../../public/game/deep-core/manifest.json';
import type { CrewId } from '@/lib/deepCoreChapters';

export interface DeepCoreAsset {
  id: string;
  publicPath: string;
  width: number;
  height: number;
  transparent: boolean;
  chapter: number | null;
  purpose: string;
}

const ASSETS: readonly DeepCoreAsset[] = manifestData.assets;
const BY_ID: ReadonlyMap<string, DeepCoreAsset> = new Map(ASSETS.map((a) => [a.id, a]));

/** Raw lookup by manifest id. `undefined` = not generated yet (§6 backlog). */
export function getAsset(id: string): DeepCoreAsset | undefined {
  return BY_ID.get(id);
}

/** Public path for a manifest id, or `undefined` if not generated yet. */
export function assetUrl(id: string): string | undefined {
  return BY_ID.get(id)?.publicPath;
}

/** Current chapter ± 1, clamped to [1, 6], de-duplicated — the preload
 * window for chapter-scoped art (kept from the prior contract; today's
 * batch only covers chapters 1-2, so most of this range resolves to
 * nothing and callers fall back to the procedural draw). */
export function chaptersToLoad(currentChapter: number): number[] {
  const c = Math.min(6, Math.max(1, Math.floor(currentChapter || 1)));
  const set = new Set<number>([c]);
  if (c > 1) set.add(c - 1);
  if (c < 6) set.add(c + 1);
  return Array.from(set).sort((a, b) => a - b);
}

// -- Parallax backgrounds (05 §3.1 sky/mid/fore) — used by the Phaser scene,
// which needs both the manifest id (as its Phaser texture key) and the URL.
export type BgLayer = 'sky' | 'mid' | 'fore';
export function backgroundLayerAsset(chapter: number, layer: BgLayer): DeepCoreAsset | undefined {
  return getAsset(`dc_bg_ch${chapter}_${layer}`);
}

// -- Rig silhouette (B2 — level/chapter-driven only, never CC/gear-track;
// 07 §0 / deepCoreChapters.ts's `rig_silhouette` kind). Only chapter 1's
// grade has shipped so far; once later grades land under the same
// `dc_rig_base_ch{N}` id pattern they replace this with zero code change.
// Until then, walk down to the highest chapter that has shipped a grade —
// a rig upgrade visually persists until the next one lands, it never
// reverts to "no rig".
export function rigSilhouetteAsset(chapter: number): DeepCoreAsset | undefined {
  for (let c = Math.min(6, Math.max(1, chapter)); c >= 1; c -= 1) {
    const asset = getAsset(`dc_rig_base_ch${c}`);
    if (asset) return asset;
  }
  return undefined;
}

// -- Wells (05 §3.1 well field; D1 in the 06 manifest). Only the "active"
// state has shipped for any chapter so far — an idle/inactive well just
// keeps falling back to the procedural bar (which already recolors for
// active vs. inactive), no separate idle art needed yet.
export function wellAsset(chapter: number, size: 'small' | 'large', active: boolean): DeepCoreAsset | undefined {
  const state = active ? 'active' : 'idle';
  for (let c = Math.min(6, Math.max(1, chapter)); c >= 1; c -= 1) {
    const asset = getAsset(`dc_well_${size}_ch${c}_${state}`);
    if (asset) return asset;
  }
  return undefined;
}

// -- Crew (A1/A2 — portraits for DOM sheets, idle sprite sample for canvas).
// `crewId` already matches the manifest's `dc_{crewId}_..._ch{N}` prefix
// exactly (deepCoreChapters.ts's CREW_IDS: crew_boss/crew_mech/crew_geo/
// crew_ops/unit_k9), so no separate id-mapping table is needed. Picks the
// highest-chapter match so a later, more-detailed variant (if ever added
// under the same prefix) is preferred automatically.
function latestCrewMatch(prefix: string): DeepCoreAsset | undefined {
  let best: DeepCoreAsset | undefined;
  for (const a of ASSETS) {
    if (!a.id.startsWith(prefix)) continue;
    if (!best || (a.chapter ?? 0) > (best.chapter ?? 0)) best = a;
  }
  return best;
}

export function crewPortraitUrl(crewId: CrewId): string | undefined {
  return latestCrewMatch(`dc_${crewId}_portrait_ch`)?.publicPath;
}

/** Only an "idle" pose sample exists in this batch (§6 backlog item 1 —
 * the full working/waiting/idle_empty/chapter_up action sheets are not made
 * yet), so this single asset stands in for every `CrewState` for now. */
export function crewIdleSpriteAsset(crewId: CrewId): DeepCoreAsset | undefined {
  return latestCrewMatch(`dc_${crewId}_idle_ch`);
}

// -- HUD stat icons (DOM-only, no chapter scoping) --------------------------
export type HudIconKind = 'sv' | 'xp' | 'operatingDays';
const HUD_ICON_IDS: Record<HudIconKind, string> = {
  sv: 'dc_icon_sv_currency',
  xp: 'dc_icon_xp',
  operatingDays: 'dc_icon_operating_days',
};
export function hudIconUrl(kind: HudIconKind): string | undefined {
  return assetUrl(HUD_ICON_IDS[kind]);
}

// -- Control bar tab icons (DOM-only). Deliberately has no 'rig' entry —
// the Rig/gear-track tab stays unbuilt in Phase 0 (00 §6.5 Q4), so
// `dc_tab_icon_rig` is never looked up anywhere in this codebase even
// though it exists in the manifest.
export type ControlBarTab = 'crew' | 'depot' | 'ledger';
const TAB_ICON_IDS: Record<ControlBarTab, string> = {
  crew: 'dc_tab_icon_crew',
  depot: 'dc_tab_icon_depot',
  ledger: 'dc_tab_icon_corelog',
};
export function tabIconUrl(tab: ControlBarTab): string | undefined {
  return assetUrl(TAB_ICON_IDS[tab]);
}
