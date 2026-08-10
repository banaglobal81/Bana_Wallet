'use client';

import { useTranslations } from 'next-intl';
import { Coins, Lock, TrendingUp } from 'lucide-react';

// docs/specs/staking-page-v2-screen-flow-frd.md §4.3 — B3 VAULT BAR. Real-money
// entry points, rendered unconditionally regardless of game state (CB-2).
export default function VaultControlBar({
  positionCount,
  onStakeClick,
  onPositionsClick,
  onYieldClick,
}: {
  positionCount: number;
  onStakeClick: () => void;
  onPositionsClick: () => void;
  onYieldClick: () => void;
}) {
  const t = useTranslations('staking');

  return (
    <div className="grid grid-cols-3 gap-2 w-full">
      <button
        type="button"
        data-testid="vault-stake-button"
        onClick={onStakeClick}
        className="control-button flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold"
      >
        <Coins className="h-4 w-4 shrink-0" /> {t('nav.stake')}
      </button>

      <button
        type="button"
        data-testid="vault-positions-button"
        onClick={onPositionsClick}
        className="control-button flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold"
      >
        <Lock className="h-4 w-4 shrink-0" />
        <span className="inline-flex items-center gap-1.5">
          {t('nav.positions')}
          {positionCount > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full bg-[#2E7DFF] text-white text-[10px] font-bold">
              {positionCount}
            </span>
          )}
        </span>
      </button>

      <button
        type="button"
        data-testid="vault-yield-button"
        onClick={onYieldClick}
        className="control-button flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold"
      >
        <TrendingUp className="h-4 w-4 shrink-0" /> {t('nav.yieldLog')}
      </button>
    </div>
  );
}
