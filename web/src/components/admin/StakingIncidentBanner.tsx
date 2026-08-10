'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { detectLiabilityIncidents } from '@/utils/adminLedgerFormat';
import type { AdminStakingStat } from '@/utils/adminApi';

/**
 * admin-staking-debt-visibility-frd.md §5.5 — the one real alarm on this
 * screen. Renders only when INV-1/2/3 (§3.4) is violated, and has NO close
 * button by design: a broken invariant means "Actually sent to wallets = 0"
 * can no longer be trusted, and that should stay visible until fixed.
 *
 * `stats === null` (fetch failed or still loading) renders nothing here —
 * the liability section itself carries the error/loading state; this banner
 * only reacts to data it actually has.
 */
export function StakingIncidentBanner({ stats }: { stats: AdminStakingStat[] | null }) {
  const t = useTranslations('adminStaking');

  if (!stats) return null;
  const incidents = detectLiabilityIncidents(stats);
  if (incidents.length === 0) return null;

  const paidStatusTotal = incidents
    .filter((i) => i.kind === 'paidStatus')
    .reduce((sum, i) => sum + (i.kind === 'paidStatus' ? i.n : 0), 0);
  const hasNegative = incidents.some((i) => i.kind === 'negative');
  const hasGrantExceeds = incidents.some((i) => i.kind === 'grantExceeds');

  return (
    <div
      data-testid="liability-incident"
      role="alert"
      className="px-4 py-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-sm flex flex-col gap-1.5"
    >
      {paidStatusTotal > 0 && (
        <p className="flex items-start gap-1.5">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {t('liability.incident.paidStatus', { n: paidStatusTotal })}
        </p>
      )}
      {hasNegative && (
        <p className="flex items-start gap-1.5">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {t('liability.incident.negative')}
        </p>
      )}
      {hasGrantExceeds && (
        <p className="flex items-start gap-1.5">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {t('liability.incident.grantExceeds')}
        </p>
      )}
    </div>
  );
}
