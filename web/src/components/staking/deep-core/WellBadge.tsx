'use client';

import { useTranslations } from 'next-intl';

// docs/specs/deep-core-05-screen-flow-frd.md §2.6 — the ONE addition to each
// My Stakes row (G-10's "배지 1개"). Clicking scrolls to / highlights the
// canvas well; this component only renders the badge, the canvas-side
// highlight is out of scope for a Phase 0 vertical slice (canvas has no
// per-well selection state yet — a well click already scrolls back to this
// row via `onWellClick`, so the "scroll to me" direction already exists).
export default function WellBadge({ seq, chapter, onClick }: { seq: number; chapter: number; onClick?: () => void }) {
  const t = useTranslations('staking.game');
  return (
    <button
      type="button"
      data-testid="deep-core-well-badge"
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#1E3559] bg-[#020d24]/60 text-[10px] font-mono text-[#8c90a0] hover:text-[#afc6ff] hover:border-[#528dff]/40 cursor-pointer shrink-0"
    >
      {t('well.badge', { seq, chapter })}
    </button>
  );
}
