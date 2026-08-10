'use client';

import { useTranslations } from 'next-intl';

// docs/specs/deep-core-05-screen-flow-frd.md §5.1 — first-mount-only intro,
// skippable, never re-shown, no yield/bonus language (T-2/T-3).
export default function DeepCoreIntroOverlay({ onDismiss }: { onDismiss: () => void }) {
  const t = useTranslations('staking.game');
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#020d24]/85 p-4 rounded-2xl">
      <div data-testid="deep-core-intro" className="max-w-xs text-center flex flex-col gap-3">
        <h3 className="text-sm font-extrabold text-white">{t('intro.title')}</h3>
        <p className="text-[11px] font-mono text-[#8c90a0] leading-relaxed">{t('intro.body1')}</p>
        <p className="text-[11px] font-mono text-[#8c90a0] leading-relaxed">{t('intro.body2')}</p>
        <button
          type="button"
          data-testid="deep-core-intro-dismiss"
          onClick={onDismiss}
          className="mt-1 py-2 rounded-xl bg-[#2E7DFF]/15 hover:bg-[#2E7DFF]/25 border border-[#528dff]/40 text-[#afc6ff] hover:text-white text-xs font-bold cursor-pointer"
        >
          {t('intro.dismiss')}
        </button>
      </div>
    </div>
  );
}
