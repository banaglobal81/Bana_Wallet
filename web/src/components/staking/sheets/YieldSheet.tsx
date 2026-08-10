'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import SheetShell from './SheetShell';
import { getStakingRewardsPage, type StakingPayoutRow, type StakePosition } from '../../../utils/stakingApi';
import { fmtDate } from '../renewalCopy';

// docs/specs/staking-page-v2-screen-flow-frd.md §4.6 — S-YIELD. Daily
// settlement log only. The "Claims" tab (YL-4) is deliberately not built —
// there is no claim rail in PS-A, so it would only ever be an empty tab for
// a feature that doesn't exist yet (§11.2: no PS-B render path).
export default function YieldSheet({
  positions,
  onClose,
}: {
  positions: StakePosition[];
  onClose: () => void;
}) {
  const t = useTranslations('staking');
  const [rows, setRows] = useState<StakingPayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await getStakingRewardsPage();
        if (cancelled) return;
        setRows(r.payouts); setHasMore(r.hasMore); setCursor(r.nextCursor);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await getStakingRewardsPage({ cursor });
      setRows((prev) => [...prev, ...r.payouts]);
      setHasMore(r.hasMore); setCursor(r.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  const labelFor = (positionId: string): string => {
    const p = positions.find((x) => x.id === positionId);
    return p ? `${p.principal} ${p.coin} · ${p.productName}` : positionId;
  };

  return (
    <SheetShell title={t('yieldLog.title')} onClose={onClose}>
      {loading ? (
        <div className="flex items-center gap-2.5 py-8 justify-center"><Loader2 className="h-5 w-5 text-[#528dff] animate-spin" /><span className="text-sm text-[#8c90a0]">{t('loading')}</span></div>
      ) : rows.length === 0 ? (
        <div className="p-6 rounded-2xl bg-[#1E3559]/30 border border-[#1E3559] text-center text-sm text-[#8c90a0]">{t('yieldLog.empty')}</div>
      ) : (
        <div className="flex flex-col">
          {rows.map((r) => (
            <div key={r.id} data-testid="yield-log-row" className="border-b border-[#1E3559]/50 py-3 last:border-b-0 flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0 flex flex-col gap-0.5">
                <span className="text-[#8c90a0] font-mono text-xs">{fmtDate(r.paidAt)}</span>
                <span className="text-white text-xs truncate">{labelFor(r.positionId)}</span>
              </div>
              {/* Server decimal string, as-is (N-3). */}
              <div className="text-white font-mono text-sm shrink-0">+{r.amount} {r.coin}</div>
            </div>
          ))}
          {hasMore && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="mt-3 py-2 rounded-xl bg-[#1E3559]/40 hover:bg-[#1E3559]/60 border border-[#1E3559] text-xs font-bold text-[#afc6ff] hover:text-white cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {t('yieldLog.loadMore')}
            </button>
          )}
        </div>
      )}
    </SheetShell>
  );
}
