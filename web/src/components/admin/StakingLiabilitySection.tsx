'use client';

import { useTranslations } from 'next-intl';
import { RefreshCw } from 'lucide-react';
import { StakingLiabilityCard } from './StakingLiabilityCard';
import type { AdminStakingStat } from '@/utils/adminApi';

/**
 * admin-staking-debt-visibility-frd.md §4.1/§4.2, §5.4 (A8 fix).
 *
 * `stats === null` + `error` set is a fetch failure and MUST render as an
 * error card with zero numbers on screen (AC-8) — never as an empty grid,
 * which used to read as "liability is 0" (A8, the worst existing defect this
 * FRD fixes). `stats === []` (loaded, zero positions) is a distinct state
 * (E-4) rendered as an explicit "no positions" message, not a blank section.
 */
export function StakingLiabilitySection({
  stats,
  error,
  onRetry,
}: {
  stats: AdminStakingStat[] | null;
  error: string | null;
  onRetry: () => void;
}) {
  const t = useTranslations('adminStaking');

  if (error) {
    return (
      <section data-testid="liability-error" className="p-5 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex flex-col gap-2">
        <h3 className="text-sm font-bold text-rose-300">{t('liability.state.error.title')}</h3>
        <p className="text-xs text-rose-200/90 leading-relaxed">{t('liability.state.error.body')}</p>
        <button
          onClick={onRetry}
          className="self-start mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-200 text-xs font-bold cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5" /> {t('liability.state.error.retry')}
        </button>
      </section>
    );
  }

  // Defensive only: the caller gates rendering on its own loading flag, so by
  // the time this renders `stats` should already be an array. No numbers are
  // rendered in this branch either way (E-3).
  if (!stats) return null;

  if (stats.length === 0) {
    return (
      <section data-testid="liability-empty" className="p-6 rounded-2xl bg-[#112643]/70 border border-[#1E3559] text-center text-sm text-[#8c90a0]">
        {t('liability.state.empty')}
      </section>
    );
  }

  return (
    <section data-testid="liability-section" className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-[#d8e2ff]">{t('liability.sectionTitle')}</h2>
        <p className="text-[11px] text-[#8c90a0] mt-1">{t('liability.sectionNote')}</p>
      </div>
      {/* §4.2: one card per coin, deliberately no cross-coin total row. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {stats.map((s) => (
          <StakingLiabilityCard key={s.coin} stat={s} />
        ))}
      </div>
    </section>
  );
}
