'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Coins, ChevronRight, TrendingUp } from 'lucide-react';
import Decimal from 'decimal.js';
import { getStakePositions, getStakingRewards } from '../../utils/stakingApi';
import { accruedInterest } from '../../lib/stakingMath';
import CoinAvatar from '../wallet/CoinAvatar';

/**
 * Compact "your staked coin + live earnings" card for the Wallet / Dashboard.
 * Display-only: it reads the staking ledger (positions + credited rewards) and
 * never moves funds. The "Earning now" figure is recomputed on the client every
 * second, so users see the number climb — matching the Staking page. Renders
 * nothing for users who have no positions, so it stays out of the way.
 */
export default function StakedSummaryCard({ onOpen }: { onOpen?: () => void }) {
  const t = useTranslations('stakedSummary');
  const [staked, setStaked] = useState<Decimal | null>(null);
  const [credited, setCredited] = useState(new Decimal(0));
  const [coin, setCoin] = useState('BANA');
  const [live, setLive] = useState(new Decimal(0));
  const [now, setNow] = useState(() => Date.now());

  // Keep the raw ACTIVE positions so we can recompute accrual live each tick.
  const [active, setActive] = useState<
    Array<{ principal: string; dailyRatePct: string; startAt: string; termDays: number }>
  >([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [positions, rewards] = await Promise.all([getStakePositions(), getStakingRewards()]);
        if (cancelled) return;
        const act = positions.filter((p) => p.status === 'ACTIVE');
        setActive(act.map((p) => ({ principal: p.principal, dailyRatePct: p.dailyRatePct, startAt: p.startAt, termDays: p.termDays })));
        setStaked(act.reduce((s, p) => s.plus(p.principal || '0'), new Decimal(0)));
        if (positions[0]?.coin) setCoin(positions[0].coin);
        setCredited(
          Object.values(rewards.totalByCoin ?? {}).reduce((s, a) => s.plus(a || '0'), new Decimal(0)),
        );
      } catch {
        if (!cancelled) setStaked(new Decimal(0));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Tick the live accrual once a second.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const nowDate = new Date(now);
    setLive(
      active.reduce(
        (s, p) => s.plus(accruedInterest(p.principal, p.dailyRatePct, p.startAt, p.termDays, nowDate)),
        new Decimal(0),
      ),
    );
  }, [active, now]);

  // Still loading, or nothing staked and nothing ever earned → render nothing.
  if (staked === null) return null;
  if (staked.lte(0) && credited.lte(0)) return null;

  return (
    <button
      onClick={onOpen}
      className="w-full text-left p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] hover:border-emerald-400/40 transition-colors flex flex-col sm:flex-row sm:items-center gap-4 cursor-pointer group"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400 shrink-0"><Coins className="h-5 w-5" /></div>
        <div className="min-w-0">
          <div className="text-[11px] font-mono text-[#8c90a0] uppercase tracking-wider flex items-center gap-1.5">
            {t('title')}
            <span className="inline-flex items-center gap-1 text-emerald-400 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
              <span className="w-1 h-1 rounded-full bg-emerald-400 animate-ping block" /> {t('live')}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <CoinAvatar symbol={coin} size={22} />
            <span className="text-sm font-bold text-white font-mono">{staked.toSignificantDigits(8).toString()}</span>
            <span className="text-xs text-[#8c90a0]">{coin} · {t('staked')}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-5 shrink-0 pl-1">
        <div className="text-right">
          <div className="text-[10px] font-mono text-[#8c90a0] uppercase tracking-wide">{t('earning')}</div>
          <div className="text-sm font-bold text-emerald-400 font-mono flex items-center gap-1 justify-end">
            <TrendingUp className="h-3.5 w-3.5" />+{live.toSignificantDigits(8).toString()}
          </div>
        </div>
        <div className="text-right hidden sm:block">
          <div className="text-[10px] font-mono text-[#8c90a0] uppercase tracking-wide">{t('credited')}</div>
          <div className="text-sm font-bold text-white font-mono">{credited.toSignificantDigits(8).toString()}</div>
        </div>
        <ChevronRight className="h-4 w-4 text-[#8c90a0] group-hover:translate-x-0.5 transition-transform" />
      </div>
    </button>
  );
}
