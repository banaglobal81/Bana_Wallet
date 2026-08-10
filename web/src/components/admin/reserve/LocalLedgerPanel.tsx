'use client';

import { useTranslations } from 'next-intl';
import Decimal from 'decimal.js';
import { formatLedgerAmount } from '@/utils/adminLedgerFormat';
import type { LocalLedgerSection, AdminSection } from '@/utils/adminApi';

function Amt({ value }: { value: string }) {
  const f = formatLedgerAmount(value);
  return (
    <span className="font-mono" title={f.truncated ? value : undefined}>
      {f.display}
    </span>
  );
}

// A-8 §6.3 LL-1~LL-10. balance/held/available always shown as three SEPARATE
// figures (LL-1) — never a computed sum rendered client-side (DC-7).
export function LocalLedgerPanel({ coin, section }: { coin: string; section: AdminSection<LocalLedgerSection> }) {
  const t = useTranslations('adminReserve.ledger');

  return (
    <section data-testid={`ledger-panel-${coin}`} className="rounded-2xl bg-[#112643]/70 border border-[#1E3559] p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white font-mono">
          {coin} · {t('title')}
        </h3>
      </div>

      {section.status === 'UNAVAILABLE' ? (
        <p className="text-sm text-rose-300">{section.reason}</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wide text-[#8c90a0]">{t('balance')}</span>
              <div className="text-white text-base"><Amt value={section.balanceTotal} /> {coin}</div>
            </div>
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wide text-[#8c90a0]">{t('heldLabel')}</span>
              <div className="text-white text-base"><Amt value={section.heldTotal} /> {coin}</div>
            </div>
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wide text-[#8c90a0]">{t('available')}</span>
              <div className="text-white text-base"><Amt value={section.availableTotal} /> {coin}</div>
            </div>
          </div>
          <p className="text-[11px] text-[#8c90a0]">{t('holders', { n: section.nonZeroBalanceUserCount, rows: section.ledgerEntryCount })}</p>

          <div className="border-t border-[#1E3559]/40 pt-3 flex flex-col gap-2">
            {section.heldByReason.map((h) => (
              <div key={h.reasonCode} data-testid={`ledger-held-${h.reasonCode}`} className="flex items-center justify-between text-sm">
                <span className="text-[#c3cee8]">
                  {t(h.reasonCode === 'WITHDRAWAL_PENDING' ? 'held.withdrawal' : 'held.stakeLock')}
                  {h.reasonCode === 'STAKE_PRINCIPAL_LOCK' && (
                    <span className="block text-[10px] text-[#8c90a0]">{t('held.stakeLockNote')}</span>
                  )}
                </span>
                <span className="font-mono text-white">
                  <Amt value={h.amount} /> {coin} ({h.count})
                </span>
              </div>
            ))}
          </div>

          <div data-testid="ledger-recon" className="border-t border-[#1E3559]/40 pt-3 flex flex-col gap-1">
            <span className="text-[11px] font-mono uppercase tracking-wide text-[#8c90a0]">{t('recon.title')}</span>
            {section.reconciliation.lastRunAt == null ? (
              <span className="text-xs text-amber-300 font-bold">{t('recon.never')}</span>
            ) : (
              <span className="text-xs text-[#c3cee8]">
                {t('recon.summary', {
                  checked: section.reconciliation.checkedCount ?? 0,
                  mismatches: section.reconciliation.mismatchCount ?? 0,
                  drift: section.reconciliation.versionDriftCount ?? 0,
                })}
              </span>
            )}
          </div>

          <div className="border-t border-[#1E3559]/40 pt-3 flex items-center justify-between text-xs">
            {section.holdInvariant.matches ? (
              <span className="text-emerald-400 font-bold">{t('holdInvariant.ok')}</span>
            ) : (
              <span className="text-rose-400 font-bold">
                {t('holdInvariant.broken', {
                  holds: section.holdInvariant.holdsTotal,
                  requests: section.holdInvariant.openWithdrawalRequestTotal,
                  diff: new Decimal(section.holdInvariant.holdsTotal)
                    .minus(new Decimal(section.holdInvariant.openWithdrawalRequestTotal))
                    .abs()
                    .toFixed(),
                })}
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
