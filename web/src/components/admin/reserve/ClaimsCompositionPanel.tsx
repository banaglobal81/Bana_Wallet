'use client';

import { useTranslations } from 'next-intl';
import { formatLedgerAmount } from '@/utils/adminLedgerFormat';
import type { LiabilitySection, AdminSection } from '@/utils/adminApi';

function Amount({ value, coin }: { value: string | null; coin?: string }) {
  const t = useTranslations('adminReserve.por');
  if (value == null) return <span className="text-amber-300 font-mono text-sm">{t('notComputable')}</span>;
  const f = formatLedgerAmount(value);
  return (
    <span className="font-mono text-white" title={f.truncated ? value : undefined}>
      {f.display}
      {coin ? ` ${coin}` : ''}
    </span>
  );
}

const COMPONENT_LABEL_KEY: Record<string, string> = {
  localLedgerBalanceTotal: 'comp.localBalance',
  unclaimedLedgeredInterestTotal: 'comp.unclaimedInterest',
  grantPrincipalPayableTotal: 'comp.grantPrincipal',
  referralPayableTotal: 'comp.referralPayable',
  activeUserFundedPrincipalTotal: 'comp.userPrincipal',
  withdrawalPendingHoldTotal: 'comp.withdrawalHold',
  compensationPlanCommitmentTotal: 'comp.compensationPlan',
  inFlightOnchainWithdrawalTotal: 'comp.inFlight',
};

// A-8 §6.2 LB-1~LB-8. Headline = leftTotal (청구권 총액), never the unclaimed-
// interest number alone (J-2 — claiming does not discharge liability).
export function ClaimsCompositionPanel({ coin, section }: { coin: string; section: AdminSection<LiabilitySection> }) {
  const t = useTranslations('adminReserve.liability');

  return (
    <section data-testid={`claims-panel-${coin}`} className="rounded-2xl bg-[#112643]/70 border border-[#1E3559] p-5 flex flex-col gap-4">
      <h3 className="text-sm font-bold text-white font-mono">
        {coin} · {t('title')}
      </h3>

      {section.status === 'UNAVAILABLE' ? (
        <p className="text-sm text-rose-300">{section.reason}</p>
      ) : (
        <>
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wide text-amber-400/80">{t('total.label')}</span>
            <div className="text-2xl font-extrabold text-amber-300 mt-1">
              <Amount value={section.leftTotal} coin={coin} />
            </div>
            <p className="text-xs text-[#8c90a0] mt-1">{t('total.note')}</p>
          </div>

          <div data-testid="claims-additive" className="border-t border-[#1E3559]/40 pt-3 flex flex-col gap-2">
            <span className="text-[11px] font-mono uppercase tracking-wide text-[#8c90a0]">{t('additive')}</span>
            {section.components
              .filter((c) => c.role === 'ADDITIVE')
              .map((c) => (
                <div key={c.key} className="flex items-center justify-between text-sm">
                  <span className="text-[#c3cee8]">{t(COMPONENT_LABEL_KEY[c.key] as never)}</span>
                  <Amount value={c.amount} coin={coin} />
                </div>
              ))}
          </div>

          <div data-testid="claims-subset" className="border-t border-[#1E3559]/40 pt-3 flex flex-col gap-2">
            <span className="text-[11px] font-mono uppercase tracking-wide text-[#8c90a0]">{t('subset')}</span>
            {section.components
              .filter((c) => c.role !== 'ADDITIVE')
              .map((c) => (
                <div key={c.key} className="flex items-center justify-between text-sm pl-3">
                  <span className="text-[#8c90a0]">
                    <span className="mr-1">↳</span>
                    {t(COMPONENT_LABEL_KEY[c.key] as never)}
                  </span>
                  <Amount value={c.amount} coin={coin} />
                </div>
              ))}
          </div>

          {section.dailyAccrualRate != null && (
            <p className="text-xs font-mono text-[#8c90a0] border-t border-[#1E3559]/40 pt-3">
              {t('accrualRate', { amount: formatLedgerAmount(section.dailyAccrualRate).display, coin })}
            </p>
          )}

          <div className="border-t border-[#1E3559]/40 pt-3 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wide text-[#8c90a0]">{t('settled.label')}</span>
              <div className="text-sm font-bold text-white">
                <Amount value={section.onchainSettledTotal} coin={coin} />
              </div>
              <p className="text-[11px] text-[#8c90a0] mt-1">{t('settled.note')}</p>
            </div>
            <span className="px-2 py-1 rounded-md text-[10px] font-bold border border-[#1E3559] text-[#8c90a0]">
              {t(section.withdrawalRailStatus === 'NO_RAIL' ? 'rail.noRail' : 'rail.manualOnchain')}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className={section.claimRailStatus === 'ENABLED' ? 'text-emerald-400 font-bold' : 'text-[#8c90a0] font-bold'}>
              {t(section.claimRailStatus === 'ENABLED' ? 'claimRail.enabled' : 'claimRail.disabled')}
            </span>
          </div>
          <p className="text-[11px] text-[#8c90a0]">{t('claimRail.note')}</p>
        </>
      )}
    </section>
  );
}
