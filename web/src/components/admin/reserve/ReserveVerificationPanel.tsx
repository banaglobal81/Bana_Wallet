'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, XCircle, MinusCircle, AlertCircle, Clock, RefreshCw as RefreshCwIcon, Settings, Lock, Play } from 'lucide-react';
import { formatLedgerAmount } from '@/utils/adminLedgerFormat';
import type { ReserveSection, AdminSection } from '@/utils/adminApi';
import { derivePorDisplayState, POR_STATE_STYLE, POR_STATE_MESSAGE_KEY, type PorDisplayState } from './porStates';

const STATE_ICON: Record<PorDisplayState, typeof CheckCircle2> = {
  PASS: CheckCircle2,
  FAIL: XCircle,
  NEVER_RUN: MinusCircle,
  QUERY_FAILED: AlertCircle,
  STALE: Clock,
  INCOMPLETE: RefreshCwIcon,
  UNCONFIGURED: Settings,
  UNAVAILABLE: Lock,
};

const STATE_KEY = POR_STATE_MESSAGE_KEY;

function Amount({ value }: { value: string | null }) {
  const t = useTranslations('adminReserve.por');
  if (value == null) return <span className="text-amber-300 font-mono text-sm">{t('notComputable')}</span>;
  const f = formatLedgerAmount(value);
  return (
    <span className="font-mono text-white" title={f.truncated ? value : undefined}>
      {f.display}
    </span>
  );
}

export function ReserveVerificationPanel({
  coin,
  section,
  onRunNow,
  running,
}: {
  coin: string;
  section: AdminSection<ReserveSection>;
  onRunNow: () => void;
  running: boolean;
}) {
  const t = useTranslations('adminReserve.por');
  // Cast to a loose signature: the state key is looked up dynamically
  // (STATE_KEY[displayState]) rather than as a literal, so next-intl's
  // generated per-key overloads (which infer "no values expected" for keys
  // it can statically see take none) don't apply here.
  const ts = useTranslations('adminReserve.por.state') as unknown as (key: string, values?: Record<string, unknown>) => string;
  const [showRaw, setShowRaw] = useState(false);

  const displayState: PorDisplayState =
    section.status === 'UNAVAILABLE'
      ? 'UNAVAILABLE'
      : derivePorDisplayState({
          sectionStatus: 'OK',
          latestRun: section.latestRun ? { result: section.latestRun.result } : null,
          isStale: section.isStale,
        });

  const style = POR_STATE_STYLE[displayState];
  const Icon = STATE_ICON[displayState];
  const run = section.status === 'OK' ? section.latestRun : null;

  return (
    <section
      data-testid={`reserve-panel-${coin}`}
      className="rounded-2xl bg-[#112643]/70 border border-[#1E3559] p-5 flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-white font-mono">
          {coin} · {t('title')}
        </h3>
        <div className="flex items-center gap-2">
          <span
            data-testid="reserve-state"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border ${style.bg} ${style.border} ${style.text}`}
          >
            <Icon className="h-3.5 w-3.5" /> {ts(`${STATE_KEY[displayState]}.title` as never, { minutes: section.status === 'OK' ? section.staleAfterMinutes : 0 })}
          </span>
          {section.status === 'OK' && !section.workerEnabled && (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold border border-[#8c90a0]/40 text-[#8c90a0]">
              {t('chip.workerOff')}
            </span>
          )}
          {section.status === 'OK' && displayState === 'FAIL' && section.isStale && (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold border border-amber-500/40 text-amber-300">
              {t('chip.staleVerdict')}
            </span>
          )}
          {section.status === 'OK' && run && section.activeControlledAddressCount !== run.controlledAddressCount && (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold border border-violet-500/40 text-violet-300">
              {t('chip.addressSetChanged')}
            </span>
          )}
        </div>
      </div>

      {section.status === 'UNAVAILABLE' ? (
        <p className="text-sm text-rose-300">{section.reason}</p>
      ) : (
        <>
          <p className="text-sm text-[#c3cee8] leading-relaxed">{ts(`${STATE_KEY[displayState]}.body` as never)}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-[#1E3559]/40 pt-4">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-mono uppercase tracking-wide text-[#8c90a0]">{t('left.label')}</span>
              <div data-testid="reserve-left" className="text-lg font-bold">
                <Amount value={run?.leftTotal ?? null} />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-mono uppercase tracking-wide text-[#8c90a0]">{t('right.label')}</span>
              <div data-testid="reserve-right" className="text-lg font-bold">
                <Amount value={run?.rightTotal ?? null} /> {coin}
              </div>
              <span className="text-[11px] text-[#8c90a0]">
                {t('right.addressCount', { n: run?.controlledAddressCount ?? 0 })}
              </span>
            </div>
          </div>

          <div className="border-t border-[#1E3559]/40 pt-4 flex flex-col gap-1">
            <span className="text-[11px] font-mono uppercase tracking-wide text-[#8c90a0]">{t('margin.label')}</span>
            {/* PR-6: margin is never emerald, even when positive — it is "not yet broken", not "profit" */}
            <div data-testid="reserve-margin" className="text-base font-bold text-white">
              <Amount value={run?.marginAmount ?? null} /> {coin}
            </div>
          </div>

          <div className="border-t border-[#1E3559]/40 pt-3 flex flex-col gap-0.5">
            <span className="text-[11px] font-mono uppercase tracking-wide text-[#8c90a0]">{t('inFlight.label')}</span>
            <div data-testid="reserve-inflight" className="text-sm font-mono text-white">
              <Amount value={section.inFlightOnchainWithdrawalTotal} /> {coin}
            </div>
            <span className="text-[11px] text-[#8c90a0]">{t('inFlight.note')}</span>
          </div>

          {(displayState === 'INCOMPLETE' || displayState === 'UNCONFIGURED') && run && (
            <div data-testid="reserve-why-incomplete" className="border-t border-[#1E3559]/40 pt-3 flex flex-col gap-1.5">
              <span className="text-xs font-bold text-white">{t('whyIncomplete.title')}</span>
              <ul className="flex flex-col gap-1">
                {run.components
                  .filter((c) => c.role === 'ADDITIVE' && c.amount == null)
                  .map((c) => (
                    <li key={c.key} className="text-xs text-amber-300">
                      · {t(c.blockedBy === 'H2_UNDECIDED' ? 'blockedBy.h2' : 'blockedBy.a4', { component: c.key })}
                    </li>
                  ))}
                {run.controlledAddressCount === 0 && (
                  <li className="text-xs text-violet-300">· {t('blockedBy.addresses')}</li>
                )}
              </ul>
            </div>
          )}

          {run?.breachDetail && (
            <p className="text-xs font-mono text-rose-300 border-t border-[#1E3559]/40 pt-3 break-all">
              {run.breachDetail}
            </p>
          )}

          <div className="border-t border-[#1E3559]/40 pt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#8c90a0]">
            <button type="button" onClick={() => setShowRaw((v) => !v)} className="hover:text-white transition-colors cursor-pointer">
              {run
                ? t('lastRun', {
                    absolute: new Date(run.ranAt).toLocaleString(),
                    relative: relativeTime(run.ranAt),
                    trigger: run.trigger,
                    id: run.id,
                  })
                : ''}
            </button>
            <button
              type="button"
              onClick={onRunNow}
              disabled={running}
              title={t('runNowTitle')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-[#2E7DFF]/40 bg-[#2E7DFF]/10 text-[#2E7DFF] hover:bg-[#2E7DFF]/20 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Play className={`h-3.5 w-3.5 ${running ? 'animate-pulse' : ''}`} /> {t('runNow')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}
