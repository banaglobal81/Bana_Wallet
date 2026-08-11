'use client';

import { useTranslations } from 'next-intl';
import type { DeepCoreGameState } from '@/utils/stakingApi';
import AssetImage from './AssetImage';
import { hudIconUrl } from './assetManifest';

// DOM overlay over the canvas (R-4 — all game text is DOM, canvas draws art
// only). Absolute-positioned inside the same box as DeepCoreCanvas.
//
// Phase 0 scope guard (00 §6.5 Q4): no Mining Power / bonus-rate readout
// here, not even the "cosmetic only" disclosure line — MP does not exist as
// a concept until P1 is unblocked, and Q4 forbids building even an inert
// placeholder for it.
export default function DeepCoreHud({
  game, chapterName, onOpenStake,
}: {
  game: DeepCoreGameState;
  chapterName: string;
  /** docs/specs/staking-page-v2-screen-flow-frd.md CH-1 — the empty-rig
   * CTA opens the S-STAKE sheet in the (now sheet-based) v2 page layout.
   *
   * T-12 ruling §3 (EG-T9-1/EG-T9-2) — the caller only ever passes this when
   * `entryState.kind === 'READY'` (i.e. a stake can actually be opened right
   * now); every other entry state passes `undefined`. This component reads
   * that presence/absence as the ENTIRE signal ("was I given an action" —
   * EG-3, the game surface never learns *why* an action is or isn't
   * available). When absent, the button is not rendered at all — there is
   * no scroll fallback any more (removed per EG-T9-3: the element it used to
   * target, `#staking-earn-section`, does not exist anywhere in `web/src`
   * and the fallback was a guaranteed dead click, worse than rendering
   * nothing). */
  onOpenStake?: () => void;
}) {
  const t = useTranslations('staking.game');
  const { xp, chapter, operatingDays, activeWellCount, surfaceState, lastLiftAt } = game;

  const bannerKey =
    surfaceState === 'S2_REPORTING_PAUSED' ? 'state.reportingPaused'
      : surfaceState === 'S3_MAINTENANCE' ? 'state.maintenance'
        : surfaceState === 'S4_IDLE_RIG' ? 'state.noActiveWell'
          : null;
  // `state.reportingPaused` is the only banner key with a `{time}` slot
  // (05 §6.3) — the other two ignore it (next-intl tolerates unused params).
  const lastUpdatedLabel = lastLiftAt ? new Date(lastLiftAt).toLocaleString() : '—';

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-2 sm:p-3 font-mono text-[10px] sm:text-[11px]">
      <div className="flex items-start justify-between gap-2">
        <span data-testid="deep-core-hud-stratum" className="px-2 py-1 rounded-lg bg-[#020d24]/60 text-[#d8e2ff] font-bold">
          {t('hud.stratum', { n: chapter, name: chapterName })}
        </span>
        <div className="flex flex-col items-end gap-1 px-2 py-1 rounded-lg bg-[#020d24]/60">
          <span data-testid="deep-core-hud-level" className="text-[#d8e2ff] font-bold">{t('hud.level', { level: xp.level })}</span>
          {xp.xpForNextLevel != null && (
            <div className="flex items-center gap-1.5">
              <div className="w-16 sm:w-24 h-1.5 rounded-full bg-[#1E3559] overflow-hidden">
                <div
                  className="h-full bg-[#528dff]"
                  style={{ width: `${Math.min(100, (xp.xpIntoLevel / xp.xpForNextLevel) * 100)}%` }}
                />
              </div>
              <span data-testid="deep-core-hud-xp" className="flex items-center gap-1 text-[#8c90a0]">
                <AssetImage src={hudIconUrl('xp')} alt="" className="h-3 w-3 shrink-0" />
                {t('hud.xpProgress', { current: xp.xpIntoLevel, next: xp.xpForNextLevel })}
              </span>
            </div>
          )}
        </div>
      </div>

      {bannerKey && (
        <div className="self-center flex flex-col items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#020d24]/80 border border-[#1E3559] text-[#afc6ff] text-center max-w-[90%]">
          <span className="pointer-events-none">{t(bannerKey, { time: lastUpdatedLabel })}</span>
          {/* EG-T9-2/EG-T9-3 — gated on `onOpenStake != null` alone, no
              fallback. The banner text above stays regardless (EG-1: label
              kept, only the button is removed when there's nothing it could
              open). */}
          {surfaceState === 'S4_IDLE_RIG' && onOpenStake != null && (
            <button
              type="button"
              data-testid="deep-core-empty-cta"
              onClick={onOpenStake}
              className="pointer-events-auto text-[#528dff] hover:text-white font-bold cursor-pointer"
            >
              {t('empty.cta')}
            </button>
          )}
        </div>
      )}

      <div className="flex items-end justify-between gap-2">
        <span data-testid="deep-core-hud-operating-days" className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#020d24]/60 text-[#8c90a0]">
          <AssetImage src={hudIconUrl('operatingDays')} alt="" className="h-3 w-3 shrink-0" />
          {t('hud.operatingDays', { days: operatingDays })}
        </span>
        <span data-testid="deep-core-hud-wells" className="px-2 py-1 rounded-lg bg-[#020d24]/60 text-[#8c90a0]">
          {t('hud.wellCount', { active: activeWellCount })}
        </span>
      </div>
    </div>
  );
}
