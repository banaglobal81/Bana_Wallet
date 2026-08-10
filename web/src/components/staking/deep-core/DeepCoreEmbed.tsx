'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { Settings2 } from 'lucide-react';
import type { DeepCoreGameState } from '@/utils/stakingApi';
import type { CrewState } from './scene/DeepCoreScene';
import { chapterTheme } from './chapterTheme';
import DeepCoreHud from './DeepCoreHud';
import DeepCoreControlBar from './DeepCoreControlBar';
import DeepCoreIntroOverlay from './DeepCoreIntroOverlay';
import {
  isHidden, setHidden, motionShouldBeReduced, getMotionPref, setMotionPref,
  isIntroSeen, markIntroSeen, getLastSeenChapter, setLastSeenChapter,
} from './DeepCorePrefs';
import { unlocksAtLevel, type CrewId } from '@/lib/deepCoreChapters';

// docs/specs/deep-core-05-screen-flow-frd.md G-2/AC-S2 — Phaser (and this
// whole canvas bundle) is only ever requested when the surface actually
// needs to render it. `ssr: false` also keeps Phaser (which touches
// `window`) out of the server render entirely.
const DeepCoreCanvas = dynamic(() => import('./DeepCoreCanvas'), { ssr: false });

export interface DeepCoreEmbedProps {
  game: DeepCoreGameState | null;
  loading: boolean;
  onWellClick?: (positionId: string) => void;
}

// The ONE insertion point into Staking.tsx (G-10: import 1 line + JSX 1
// block). Everything else — mount gating (S-0/hide), the canvas, the HUD,
// the control bar, the intro/chapter overlays — lives inside this tree
// (G-3).
export default function DeepCoreEmbed({ game, loading, onWellClick }: DeepCoreEmbedProps) {
  const t = useTranslations('staking.game');
  const [hidden, setHiddenState] = useState(true); // default true until the effect below reads localStorage (SSR-safe)
  const [motionReduced, setMotionReduced] = useState(true);
  const [motionPref, setMotionPrefState] = useState(getMotionPref);
  const [bootFailed, setBootFailed] = useState(false);
  const [introVisible, setIntroVisible] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [transitionChapter, setTransitionChapter] = useState<number | null>(null);
  const [liftBurstToken, setLiftBurstToken] = useState(0);

  const lastLiftSeenRef = useRef<string | null | undefined>(undefined);
  const introCheckedRef = useRef(false);

  useEffect(() => {
    setHiddenState(isHidden());
    setMotionReduced(motionShouldBeReduced());
  }, []);

  // First-mount intro (05 §5.1) — fires once, the very first time a user who
  // has never seen it gets a real (non-S0) game state.
  useEffect(() => {
    if (introCheckedRef.current || !game || game.surfaceState === 'S0_NOT_SHOWN') return;
    introCheckedRef.current = true;
    if (!isIntroSeen()) setIntroVisible(true);
  }, [game]);

  // Chapter transition detection (05 §4.3) — only fires when the chapter
  // actually rose since the last time this browser saw one (never on a
  // brand-new user's very first paint, where "1" would look like a rise).
  useEffect(() => {
    if (!game || game.surfaceState === 'S0_NOT_SHOWN') return;
    const last = getLastSeenChapter();
    if (last != null && game.chapter > last) setTransitionChapter(game.chapter);
    if (last !== game.chapter) setLastSeenChapter(game.chapter);
  }, [game]);

  // Lift-burst detection (05 §3.3) — one burst per newly-observed `lastLiftAt`.
  useEffect(() => {
    if (!game) return;
    if (lastLiftSeenRef.current !== undefined && lastLiftSeenRef.current !== game.lastLiftAt && game.lastLiftAt) {
      setLiftBurstToken((v) => v + 1);
    }
    lastLiftSeenRef.current = game.lastLiftAt;
  }, [game]);

  // deep-core-01-world-bible.md §4.3 — state precedence: reporting-paused
  // (`waiting`) beats idle-rig (`idle_empty`), which beats the default
  // `working`. `chapter_up` is a one-shot animation trigger, not a resting
  // state, so it's never assigned here.
  const crewState: Record<string, CrewState> = useMemo(() => {
    if (!game) return {};
    const state: CrewState =
      game.surfaceState === 'S2_REPORTING_PAUSED' ? 'waiting'
        : game.activeWellCount === 0 ? 'idle_empty'
          : 'working';
    const out: Record<string, CrewState> = {};
    for (const id of game.crew) out[id] = state;
    return out;
  }, [game]);

  if (loading || !game || game.surfaceState === 'S0_NOT_SHOWN') return null;

  if (hidden) {
    return (
      <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#112643]/40 border border-[#1E3559]/60 text-[11px] font-mono text-[#8c90a0]">
        <span>{t('pref.hideHelp')}</span>
        <button
          type="button"
          data-testid="deep-core-unhide"
          onClick={() => { setHidden(false); setHiddenState(false); }}
          className="text-[#528dff] hover:text-white cursor-pointer font-bold"
        >
          {t('pref.show')}
        </button>
      </div>
    );
  }

  if (game.surfaceState === 'S5_DISABLED') {
    return (
      <div data-testid="deep-core-disabled" className="px-3 py-2 rounded-xl bg-[#112643]/40 border border-[#1E3559]/60 text-[11px] font-mono text-[#8c90a0] text-center">
        {t('state.disabled')}
      </div>
    );
  }

  const theme = chapterTheme(game.chapter);
  const showCanvas = !bootFailed && (game.surfaceState === 'S1_RUNNING' || game.surfaceState === 'S2_REPORTING_PAUSED' || game.surfaceState === 'S4_IDLE_RIG');

  return (
    <div className="flex flex-col gap-2">
      <div
        id="deep-core-canvas-box"
        data-testid="deep-core-canvas-box"
        className="relative w-full h-[220px] sm:h-[300px] lg:h-[380px] rounded-2xl overflow-hidden border border-[#1E3559]"
        style={{ background: `linear-gradient(180deg, #${theme.sky.toString(16).padStart(6, '0')}, #${theme.fore.toString(16).padStart(6, '0')})` }}
      >
        {showCanvas ? (
          <DeepCoreCanvas
            chapter={game.chapter}
            wells={game.wells.map((w) => ({ positionId: w.positionId, relativeSize: w.relativeSize, active: w.active }))}
            crew={crewState}
            motionReduced={motionReduced}
            liftBurstToken={liftBurstToken}
            onWellClick={onWellClick}
            onBootError={() => setBootFailed(true)}
          />
        ) : (
          <div data-testid="deep-core-static-fallback" className="absolute inset-0 flex items-center justify-center text-[11px] font-mono text-[#8c90a0]">
            {bootFailed ? t('error.GAME_LOAD_FAILED') : null}
          </div>
        )}

        <DeepCoreHud game={game} chapterName={t(`chapter.${game.chapter}.name`)} />

        <button
          type="button"
          data-testid="deep-core-settings-toggle"
          onClick={() => setSettingsOpen((v) => !v)}
          className="pointer-events-auto absolute bottom-2 right-2 sm:hidden p-1.5 rounded-lg bg-[#020d24]/60 text-[#8c90a0] hover:text-white"
          aria-label={t('pref.title')}
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>

        {introVisible && (
          <DeepCoreIntroOverlay onDismiss={() => { markIntroSeen(); setIntroVisible(false); }} />
        )}

        {transitionChapter != null && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#020d24]/85 p-4">
            <div data-testid="deep-core-chapter-transition" className="text-center flex flex-col gap-2">
              <span className="text-sm font-extrabold text-white">{t('stratum.reached', { n: transitionChapter })}</span>
              {(() => {
                const items = unlocksAtLevel(game.xp.level)
                  .flatMap((u) => [
                    ...(u.crewIds ?? []).map((id: CrewId) => t(`crew.${id}.name`)),
                    ...(u.cosmeticSlot ? [t(`depot.slot.${u.cosmeticSlot}`)] : []),
                  ]);
                return items.length > 0 ? (
                  <span className="text-[11px] font-mono text-[#8c90a0]">{t('level.unlocked', { items: items.join(', ') })}</span>
                ) : null;
              })()}
              <button
                type="button"
                onClick={() => setTransitionChapter(null)}
                className="mt-1 px-3 py-1.5 rounded-xl bg-[#2E7DFF]/15 border border-[#528dff]/40 text-[#afc6ff] hover:text-white text-xs font-bold cursor-pointer"
              >
                {t('intro.dismiss')}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <DeepCoreControlBar game={game} crewState={crewState} />
      </div>

      {settingsOpen && (
        <div data-testid="deep-core-settings-panel" className="flex flex-col gap-2 p-3 rounded-xl bg-[#112643]/60 border border-[#1E3559] text-xs font-mono">
          <span className="text-[10px] font-mono uppercase text-[#8c90a0]">{t('pref.title')}</span>
          <label className="flex items-center justify-between gap-2 cursor-pointer">
            <span className="text-[#d8e2ff]">{t('pref.motionReduced')}</span>
            <input
              type="checkbox"
              checked={motionPref !== 'auto'}
              onChange={(e) => { const p = e.target.checked ? 'reduced' : 'auto'; setMotionPref(p); setMotionPrefState(p); setMotionReduced(motionShouldBeReduced()); }}
              className="accent-[#528dff]"
            />
          </label>
          <button
            type="button"
            data-testid="deep-core-hide-toggle"
            onClick={() => { setHidden(true); setHiddenState(true); }}
            className="text-left text-[#528dff] hover:text-white cursor-pointer"
          >
            {t('pref.hide')}
          </button>
          <span className="text-[10px] text-[#8c90a0]">{t('pref.hideHelp')}</span>
        </div>
      )}
    </div>
  );
}
