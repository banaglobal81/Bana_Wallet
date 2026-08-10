'use client';

import { useTranslations } from 'next-intl';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import type { IssuanceGateSection, AdminSection } from '@/utils/adminApi';

const RESOLUTION_HINT_KEY: Record<string, string> = {
  AUTHORITY_T2_HALTED: 'hint.authorityT2',
  AUTHORITY_T1_WARNING: 'hint.authorityT1',
  POR_FAIL: 'hint.por',
  POR_NOT_VERIFIED: 'hint.por',
  KILL_SWITCH_CLAIM_DISABLED: 'hint.killSwitch',
  KILL_SWITCH_SETTLEMENT_DISABLED: 'hint.killSwitch',
  MAINTENANCE_MODE: 'hint.maintenance',
};

// A-8 §6.5 IG-1~IG-5 — every active blocker is listed, never collapsed into a
// single yes/no. No toggle/override control lives in this panel (IG-3).
export function IssuanceGatePanel({ coin, section }: { coin: string; section: AdminSection<IssuanceGateSection> }) {
  const t = useTranslations('adminReserve.gate');

  return (
    <section data-testid={`gate-panel-${coin}`} className="rounded-2xl bg-[#112643]/70 border border-[#1E3559] p-5 flex flex-col gap-3">
      <h3 className="text-sm font-bold text-white font-mono">
        {coin} · {t('title')}
      </h3>

      {section.status === 'UNAVAILABLE' ? (
        <p className="text-sm text-rose-300">{section.reason}</p>
      ) : section.blockers.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-emerald-400 font-bold">
          <ShieldCheck className="h-4 w-4" /> {t('none')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {section.blockers.map((b, i) => (
            <li key={`${b.code}-${i}`} data-testid={`gate-blocker-${b.code}`} className="flex items-start gap-2 text-sm text-amber-300">
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                {t(
                  b.code === 'POR_FAIL' ? 'blocker.porFail' : b.code === 'POR_NOT_VERIFIED' ? 'blocker.porUnverified' :
                  b.code === 'AUTHORITY_T2_HALTED' ? 'blocker.t2' : b.code === 'AUTHORITY_T1_WARNING' ? 'blocker.t1' :
                  b.code === 'KILL_SWITCH_CLAIM_DISABLED' ? 'blocker.claimOff' : b.code === 'KILL_SWITCH_SETTLEMENT_DISABLED' ? 'blocker.settlementOff' :
                  'blocker.maintenance' as never,
                  { id: b.runId ?? '', state: b.state ?? '' },
                )}
                <span className="block text-[11px] text-[#8c90a0] mt-0.5">{t(RESOLUTION_HINT_KEY[b.code] as never)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
