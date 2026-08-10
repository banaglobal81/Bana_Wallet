'use client';

import { useTranslations } from 'next-intl';
import SheetShell from './SheetShell';
import type { DeepCoreGameState } from '@/utils/stakingApi';

// docs/specs/deep-core-05-screen-flow-frd.md §2.5 — "「기록」 탭은 게이트와
// 무관하게 필수다" (03 C-8: users can always see why a balance changed). No
// CC rows / no bonus-payout rows here — P1 doesn't exist yet, so there is
// nothing to show for either.
export default function LedgerSheet({ game, onClose }: { game: DeepCoreGameState; onClose: () => void }) {
  const t = useTranslations('staking.game');
  const { xp, svEarned, xpBreakdown, svBreakdown, operatingDays, coreLogRank } = game;

  return (
    <SheetShell title={t('ledger.title')} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 rounded-xl bg-[#112643]/60 border border-[#1E3559]">
          <div className="text-[10px] font-mono uppercase text-[#8c90a0]">{t('ledger.xpTotal')}</div>
          <div data-testid="deep-core-ledger-xp" className="text-lg font-mono font-bold text-[#d8e2ff]">{xp.xpTotal}</div>
        </div>
        <div className="p-3 rounded-xl bg-[#112643]/60 border border-[#1E3559]">
          <div className="text-[10px] font-mono uppercase text-[#8c90a0]">{t('ledger.svTotal')}</div>
          <div data-testid="deep-core-ledger-sv" className="text-lg font-mono font-bold text-[#afc6ff]">{svEarned}</div>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-mono uppercase tracking-wide text-[#8c90a0]">{t('ledger.xpTotal')}</span>
        <LedgerRow label={t('ledger.sourceLift')} value={xpBreakdown.lift} />
        <LedgerRow label={t('ledger.sourceCharterOpen')} value={xpBreakdown.charterOpen} />
        <LedgerRow label={t('ledger.sourceCharterComplete')} value={xpBreakdown.charterComplete} />
      </div>

      <div className="flex flex-col gap-1 pt-1 border-t border-[#1E3559]/50">
        <span className="text-[10px] font-mono uppercase tracking-wide text-[#8c90a0]">{t('ledger.svTotal')}</span>
        <LedgerRow label={t('ledger.sourceStratum')} value={svBreakdown.stratum} />
        <LedgerRow label={t('ledger.sourceCharterComplete')} value={svBreakdown.charterComplete} />
        <LedgerRow label={t('ledger.sourceCoreLog')} value={svBreakdown.coreLog} />
      </div>

      <div className="pt-1 border-t border-[#1E3559]/50 text-[11px] font-mono text-[#8c90a0]">
        {t('hud.operatingDays', { days: operatingDays })}
      </div>

      {coreLogRank > 0 && (
        <div className="flex flex-col gap-0.5 pt-1 border-t border-[#1E3559]/50">
          <span data-testid="deep-core-core-log-rank" className="text-[11px] font-mono text-[#d8e2ff]">{t('coreLog.rank', { rank: coreLogRank })}</span>
          <span className="text-[10px] font-mono text-[#8c90a0]">{t('coreLog.noYield')}</span>
        </div>
      )}
    </SheetShell>
  );
}

function LedgerRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-[11px] font-mono text-[#8c90a0]">
      <span>{label}</span>
      <span className="text-[#d8e2ff]">+{value}</span>
    </div>
  );
}
