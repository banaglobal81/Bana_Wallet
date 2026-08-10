'use client';

import { useTranslations } from 'next-intl';
import { Sprout, ChevronRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { formatLedgerAmount } from '@/utils/adminLedgerFormat';
import type { AdminStakingStat } from '@/utils/adminApi';

/**
 * admin-staking-debt-visibility-frd.md §6 (D-1..D-5). The dashboard summary
 * is deliberately thinner than the full /admin/staking cards: D-4 — show
 * only the single most important number (unpaid interest) plus locked
 * principal for context, and hand everything else (settled=0, grants) off to
 * the full page via the link. Re-summarizing all three numbers here is what
 * caused the original bug (an undifferentiated single "totalPaid" figure).
 */
export function StakingLiabilityDashboardStrip({
  stats,
  error,
  loading,
}: {
  stats: AdminStakingStat[] | null;
  error: string | null;
  loading: boolean;
}) {
  const t = useTranslations('adminDashboard');
  const tShared = useTranslations('adminStaking');

  // E-3: never render a number while still loading — skeleton/label only.
  if (loading) {
    return (
      <div className="rounded-2xl bg-[#112643]/70 border border-[#1E3559] p-5 text-xs font-mono text-[#8c90a0]">
        {tShared('liability.state.loading')}
      </div>
    );
  }

  // E-1/E-2 (A8 fix): a failed fetch must not render as "liability is 0".
  if (error) {
    return (
      <div data-testid="liability-error" className="rounded-2xl bg-rose-500/10 border border-rose-500/25 p-5 text-sm text-rose-300">
        {t('stakingLiability.error')}
      </div>
    );
  }

  if (!stats) return null;

  // E-4: loaded, genuinely zero positions — distinct from E-2's "couldn't load".
  if (stats.length === 0) {
    return (
      <div data-testid="liability-empty" className="rounded-2xl bg-[#112643]/70 border border-[#1E3559] p-5 text-center text-sm text-[#8c90a0]">
        {tShared('liability.state.empty')}
      </div>
    );
  }

  return (
    <Link
      href="/admin/staking"
      data-testid="liability-section"
      className="rounded-2xl bg-[#112643]/70 border border-[#1E3559] hover:border-amber-500/40 transition-colors p-5 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono uppercase tracking-widest text-[#8c90a0] font-bold flex items-center gap-1.5">
          <Sprout className="h-3.5 w-3.5 text-amber-400" /> {t('stakingLiability.title')}
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-[#8c90a0]" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {stats.map((s) => {
          const unpaid = formatLedgerAmount(s.unpaidInterest);
          const principal = formatLedgerAmount(s.activePrincipal);
          return (
            <div key={s.coin} data-testid={`liability-card-${s.coin}`} className="flex flex-col gap-0.5">
              <span className="text-[11px] font-mono text-[#8c90a0]">{t('stakingLiability.unpaid', { coin: s.coin })}</span>
              {/* D-1 row 1: unpaid interest — amber, the strip's headline number. */}
              <span
                className="text-xl font-bold text-amber-300 font-mono truncate"
                title={unpaid.truncated ? s.unpaidInterest : undefined}
              >
                {unpaid.display} {s.coin}
              </span>
              {/* D-1 row 2: locked principal + active count — neutral color. */}
              <span className="text-[11px] font-mono text-[#8c90a0] truncate">
                {t('stakingLiability.principalSub', { amount: `${principal.display} ${s.coin}`, n: s.activeCount })}
              </span>
            </div>
          );
        })}
      </div>
    </Link>
  );
}
