'use client';

import { useTranslations } from 'next-intl';
import { ShieldCheck, ChevronRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { formatLedgerAmount } from '@/utils/adminLedgerFormat';
import type { AdminSolvencyData } from '@/utils/adminApi';
import { derivePorDisplayState, POR_STATE_STYLE, POR_STATE_MESSAGE_KEY } from './porStates';

// A-8 §7.2 AD-1~AD-6 — the /admin/dashboard summary. Only TWO numbers per
// coin (leftTotal headline + PoR verdict chip) — the full breakdown lives at
// /admin/reserve (AD-1). Never renders "0" for a null leftTotal (AD-2/PR-3).
export function ReserveDashboardStrip({
  data,
  error,
  loading,
}: {
  data: AdminSolvencyData | null;
  error: string | null;
  loading: boolean;
}) {
  const t = useTranslations('adminDashboard');
  const tp = useTranslations('adminReserve.por.state');

  if (loading && !data) {
    return (
      <div className="rounded-2xl bg-[#112643]/70 border border-[#1E3559] p-5 text-xs font-mono text-[#8c90a0]">
        {t('loading')}
      </div>
    );
  }
  if (error && !data) {
    return (
      <div data-testid="reserve-strip-error" className="rounded-2xl bg-rose-500/10 border border-rose-500/25 p-5 text-sm text-rose-300">
        {t('reserveStrip.error')}
      </div>
    );
  }
  if (!data) return null;

  const localCoins = data.coins.filter((c) => c.authority === 'LOCAL');
  if (localCoins.length === 0) {
    return (
      <div data-testid="reserve-strip-empty" className="rounded-2xl bg-[#112643]/70 border border-[#1E3559] p-5 text-center text-sm text-[#8c90a0]">
        {t('reserveStrip.empty')}
      </div>
    );
  }

  return (
    <Link
      href="/admin/reserve"
      data-testid="reserve-strip"
      className="rounded-2xl bg-[#112643]/70 border border-[#1E3559] hover:border-[#528dff]/40 transition-colors p-5 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono uppercase tracking-widest text-[#8c90a0] font-bold flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-[#528dff]" /> {t('reserveStrip.title')}
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-[#8c90a0]" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {localCoins.map((c) => {
          const run = c.reserve.status === 'OK' ? c.reserve.latestRun : null;
          const state = derivePorDisplayState({
            sectionStatus: c.reserve.status,
            latestRun: run ? { result: run.result } : null,
            isStale: c.reserve.status === 'OK' ? c.reserve.isStale : false,
          });
          const style = POR_STATE_STYLE[state];
          const left = run?.leftTotal ?? null;
          return (
            <div key={c.coin} data-testid={`reserve-strip-${c.coin}`} className="flex flex-col gap-1">
              <span className="text-[11px] font-mono text-[#8c90a0]">{c.coin}</span>
              <span className="text-lg font-bold text-amber-300 font-mono truncate">
                {left == null ? t('reserveStrip.notComputable') : `${formatLedgerAmount(left).display} ${c.coin}`}
              </span>
              <span className={`self-start px-2 py-0.5 rounded-md text-[10px] font-bold border ${style.bg} ${style.border} ${style.text}`}>
                {tp(`${POR_STATE_MESSAGE_KEY[state]}.title` as never)}
              </span>
            </div>
          );
        })}
      </div>
    </Link>
  );
}
