'use client';

import { useTranslations } from 'next-intl';
import type { AuthorityWatchSection, AdminSection } from '@/utils/adminApi';

// A-8 §6.6 AU-1~AU-10. Authority (HUB/LOCAL) and alert stage (CLEAR/T1/T2)
// are two SEPARATE chips (AU-1) — merging them reads as "LOCAL means
// warning", which is false. CLEAR is only shown as clean when the probe
// worker is on and fresh (AU-4) — otherwise it renders "unverified", not a
// false-clean green.
export function AuthorityWatchPanel({ coin, section }: { coin: string; section: AdminSection<AuthorityWatchSection> }) {
  const t = useTranslations('adminReserve.authority');

  if (section.status === 'UNAVAILABLE') {
    return (
      <section data-testid={`authority-panel-${coin}`} className="rounded-2xl bg-[#112643]/70 border border-[#1E3559] p-5">
        <h3 className="text-sm font-bold text-white font-mono mb-2">{coin} · {t('title')}</h3>
        <p className="text-sm text-rose-300">{section.reason}</p>
      </section>
    );
  }

  const unverified = !section.probeWorkerEnabled || section.probeIsStale;
  const stage: 'clear' | 't1' | 't2' | 'unverified' =
    section.alertStage === 'T2_HALTED' ? 't2' : section.alertStage === 'T1_WARNING' ? 't1' : unverified ? 'unverified' : 'clear';

  const stageStyle: Record<typeof stage, string> = {
    clear: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400',
    unverified: 'border-[#8c90a0]/40 bg-[#8c90a0]/15 text-[#8c90a0]',
    t1: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
    t2: 'border-rose-500/40 bg-rose-500/15 text-rose-300',
  } as Record<string, string>;

  return (
    <section data-testid={`authority-panel-${coin}`} className="rounded-2xl bg-[#112643]/70 border border-[#1E3559] p-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold text-white font-mono">{coin}</h3>
        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold border border-[#1E3559] text-[#c3cee8]">
          {t(section.authority === 'HUB' ? 'hub' : 'local')}
        </span>
        <span data-testid="authority-stage" className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${stageStyle[stage]}`}>
          {t(`stage.${stage}` as never)}
        </span>
      </div>

      {stage === 't1' && <p className="text-xs text-[#8c90a0]">{t('hubListedYes')}</p>}

      {stage === 't2' && section.t2Evidence && (
        <p data-testid="authority-evidence" className="text-xs text-rose-200 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2.5">
          {t('t2.evidence', {
            amount: section.t2Evidence.amount,
            userId: section.t2Evidence.userId,
            when: new Date(section.t2Evidence.probedAt).toLocaleString(),
          })}
        </p>
      )}

      <p className="text-xs text-[#8c90a0]">{t(stage === 't2' ? 't2.impact' : 't1.impact')}</p>

      <div className="flex items-center justify-between text-[11px] text-[#8c90a0]">
        <span>{t('unknownRun', { n: section.consecutiveUnknownCount, threshold: section.unknownEscalationThreshold })}</span>
        {!section.probeWorkerEnabled && <span className="text-amber-300">{t('probeOff')}</span>}
      </div>

      {(stage === 't1' || stage === 't2') && <p className="text-[11px] text-[#8c90a0] italic">{t('noClear')}</p>}
    </section>
  );
}
