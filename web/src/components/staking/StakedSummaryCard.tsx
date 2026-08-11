'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Coins, ChevronRight } from 'lucide-react';
import Decimal from 'decimal.js';
import { getStakePositionsAndGame, getStakingRewards } from '../../utils/stakingApi';
import CoinAvatar from '../wallet/CoinAvatar';

/**
 * Compact "your staked coins" card for the Wallet / Dashboard.
 *
 * Display-only, and 100% server-sourced (addendum SS —
 * docs/specs/staking-page-v2-screen-flow-frd-addendum-ss.md §3 SS-2):
 * - Principal per coin comes straight from `getStakePositionsAndGame().lockedPrincipal`,
 *   the SAME per-coin figure the withdrawal route uses to compute the lock (R-D2) —
 *   never summed/derived on the client (AC-V6/AC-SS-2).
 * - Recorded yield per coin comes straight from `getStakingRewards().totalByCoin`,
 *   never merged across coins into one scalar (AC-V2/AC-SS-3).
 * - There is deliberately no client-side interest projection, no timer driving
 *   any amount shown here (AC-SS-1), and no "Live" badge — so the figures stay
 *   fixed while `stakingWorkerEnabled=false` / settlement is paused (AC-V20/AC-SS-4).
 *   A maturity countdown clock was considered and explicitly descoped (SS-2a,
 *   M-1): with multiple positions per coin "which position's maturity" is
 *   undefined, and a clock would resurrect the same timer this fix removes.
 *   The slot is left empty rather than filled with a substitute.
 */
export default function StakedSummaryCard({ onOpen }: { onOpen?: () => void }) {
  const t = useTranslations('stakedSummary');
  // null = still loading. Once loaded, always an object (possibly empty).
  const [staked, setStaked] = useState<Record<string, string> | null>(null);
  const [recorded, setRecorded] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ lockedPrincipal }, rewards] = await Promise.all([
          getStakePositionsAndGame(),
          getStakingRewards(),
        ]);
        if (cancelled) return;
        setStaked(lockedPrincipal ?? {});
        setRecorded(rewards.totalByCoin ?? {});
      } catch {
        if (!cancelled) setStaked({});
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Still loading → render nothing yet.
  if (staked === null) return null;

  // AC-SS-3: per-coin only — never merged into a single scalar with one
  // coin's symbol as the label. Union of coins with a nonzero locked
  // principal or a nonzero recorded yield, even though today only BANA is
  // stakeable (SS-2c — no single-coin shortcuts).
  const coins = Array.from(new Set([...Object.keys(staked), ...Object.keys(recorded)]))
    .filter((c) => new Decimal(staked[c] || '0').gt(0) || new Decimal(recorded[c] || '0').gt(0))
    .sort();

  // SS-2d: nothing staked and nothing ever recorded, in any coin → render nothing.
  if (coins.length === 0) return null;

  return (
    <button
      onClick={onOpen}
      className="w-full text-left p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] hover:border-emerald-400/40 transition-colors flex flex-col gap-4 cursor-pointer group"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400 shrink-0"><Coins className="h-5 w-5" /></div>
          <div className="text-[11px] font-mono text-[#8c90a0] uppercase tracking-wider">{t('title')}</div>
        </div>
        <ChevronRight className="h-4 w-4 text-[#8c90a0] group-hover:translate-x-0.5 transition-transform shrink-0" />
      </div>

      <div className="flex flex-col gap-3 pl-1">
        {coins.map((coin) => {
          const s = new Decimal(staked[coin] || '0');
          const r = new Decimal(recorded[coin] || '0');
          return (
            <div key={coin} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 min-w-0">
                <CoinAvatar symbol={coin} size={22} />
                <span className="text-sm font-bold text-white font-mono">{s.toSignificantDigits(8).toString()}</span>
                <span className="text-xs text-[#8c90a0]">{coin} · {t('staked')}</span>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[10px] font-mono text-[#8c90a0] uppercase tracking-wide">{t('recordedLabel')}</div>
                <div className="text-sm font-bold text-white font-mono">{r.toSignificantDigits(8).toString()}</div>
              </div>
            </div>
          );
        })}
      </div>
    </button>
  );
}
