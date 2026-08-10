'use client';

import { useTranslations } from 'next-intl';
import { Coins, Lock } from 'lucide-react';
import { formatLedgerAmount, isZeroAmount } from '@/utils/adminLedgerFormat';
import type { AdminStakingStat } from '@/utils/adminApi';

/**
 * admin-staking-debt-visibility-frd.md §4.2. One card per coin — no cross-coin
 * total row (§4.2: summing different assets' quantities is meaningless).
 *
 * S-1: unpaid interest is the headline (largest type). S-3: no emerald / "+"
 * on it — amber only, this is a liability, not a credit. S-4: locked
 * principal stays neutral. S-6: the grant line only renders when non-zero.
 */
export function StakingLiabilityCard({ stat }: { stat: AdminStakingStat }) {
  const t = useTranslations('adminStaking');

  const unpaid = formatLedgerAmount(stat.unpaidInterest);
  const settled = formatLedgerAmount(stat.hubSettled);
  const principal = formatLedgerAmount(stat.activePrincipal);
  const grant = formatLedgerAmount(stat.grantedActivePrincipal);
  const rate = formatLedgerAmount(stat.dailyAccrualRate);
  const showGrant = !isZeroAmount(stat.grantedActivePrincipal);

  return (
    <div data-testid={`liability-card-${stat.coin}`} className="p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Coins className="h-4 w-4 text-[#528dff]" /> {stat.coin}
        </div>
        {stat.hubSettledStatus === 'NO_RAIL' && (
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-300 border-amber-500/25 whitespace-nowrap">
            {t('liability.badge.noRail')}
          </span>
        )}
      </div>

      {/* S-1: headline — unpaid interest. S-3: amber, no "+" prefix. */}
      <div data-testid="liability-unpaid">
        <div className="text-[10px] font-mono uppercase tracking-wide text-[#8c90a0]">{t('liability.unpaid.label')}</div>
        <div
          className="font-mono font-extrabold text-2xl text-amber-300 truncate"
          title={unpaid.truncated ? stat.unpaidInterest : undefined}
        >
          {unpaid.display} {stat.coin}
        </div>
        <p className="text-[11px] text-[#8c90a0] mt-1 leading-relaxed">{t('liability.unpaid.note')}</p>
        <p data-testid="liability-rate" className="text-[11px] font-mono text-amber-200/80 mt-1">
          {t('liability.unpaid.rate', { amount: rate.display, coin: stat.coin })}
        </p>
      </div>

      <div className="border-t border-[#1E3559]/60 pt-3 grid grid-cols-2 gap-3">
        {/* S-5: real-sent 0 is shown, not hidden — the 0 itself is the point. */}
        <div data-testid="liability-settled">
          <div className="text-[10px] font-mono uppercase tracking-wide text-[#8c90a0]">{t('liability.settled.label')}</div>
          <div className="font-mono font-bold text-[#d8e2ff] truncate" title={t('liability.settled.noRailTooltip')}>
            {settled.display} {stat.coin}
          </div>
          <p className="text-[11px] text-[#8c90a0] mt-1">{t('liability.settled.noRail')}</p>
        </div>
        {/* S-4: neutral color — user funds, locked, not owed. */}
        <div data-testid="liability-principal">
          <div className="text-[10px] font-mono uppercase tracking-wide text-[#8c90a0] flex items-center gap-1">
            <Lock className="h-3 w-3" /> {t('liability.principal.label')}
          </div>
          <div className="font-mono font-bold text-white truncate" title={principal.truncated ? stat.activePrincipal : undefined}>
            {principal.display} {stat.coin}
          </div>
          <p className="text-[11px] text-[#8c90a0] mt-1">{t('liability.principal.note')}</p>
        </div>
      </div>

      {/* S-6: only rendered when non-zero. §5.3: never summed into unpaidInterest. */}
      {showGrant && (
        <div data-testid="liability-grant" className="border-t border-[#1E3559]/60 pt-3">
          <div className="text-[10px] font-mono uppercase tracking-wide text-[#8c90a0]">{t('liability.grant.label')}</div>
          <div className="font-mono font-bold text-white truncate" title={grant.truncated ? stat.grantedActivePrincipal : undefined}>
            {grant.display} {stat.coin}
          </div>
          <p className="text-[11px] text-[#8c90a0] mt-1 leading-relaxed">{t('liability.grant.note')}</p>
        </div>
      )}

      <div className="text-[10px] font-mono text-[#8c90a0]">
        {t('liability.counts', { active: stat.activeCount, matured: stat.maturedCount, total: stat.totalCount })}
      </div>
    </div>
  );
}
