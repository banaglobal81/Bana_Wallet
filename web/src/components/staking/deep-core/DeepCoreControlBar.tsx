'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Users, Package, ScrollText } from 'lucide-react';
import type { DeepCoreGameState } from '@/utils/stakingApi';
import type { CrewState } from './scene/DeepCoreScene';
import CrewSheet from './sheets/CrewSheet';
import DepotSheet from './sheets/DepotSheet';
import LedgerSheet from './sheets/LedgerSheet';
import AssetImage from './AssetImage';
import { tabIconUrl, type ControlBarTab } from './assetManifest';

// docs/specs/deep-core-05-screen-flow-frd.md §2.5 — 4-tab control bar in the
// FRD, reduced to 3 here per the pm sign-off (00 §6.5 Q4): the "리그 / Rig"
// tab is entirely gear-track content (P1), and Q4 forbids building any
// CC/gear-track UI in Phase 0, "자리만 비워두는 것도 금지" — not even as an
// inert/disabled fourth button. Re-add it only once P1 unblocks.
type Tab = 'crew' | 'depot' | 'ledger';

export default function DeepCoreControlBar({ game, crewState }: { game: DeepCoreGameState; crewState: Record<string, CrewState> }) {
  const t = useTranslations('staking.game');
  const [open, setOpen] = useState<Tab | null>(null);

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <TabButton tab="crew" fallback={<Users className="h-4 w-4" />} onClick={() => setOpen('crew')} testId="deep-core-tab-crew" text={t('nav.crew')} />
        <TabButton tab="depot" fallback={<Package className="h-4 w-4" />} onClick={() => setOpen('depot')} testId="deep-core-tab-depot" text={t('nav.depot')} />
        <TabButton tab="ledger" fallback={<ScrollText className="h-4 w-4" />} onClick={() => setOpen('ledger')} testId="deep-core-tab-ledger" text={t('nav.ledger')} />
      </div>

      {open === 'crew' && <CrewSheet crewState={crewState} onClose={() => setOpen(null)} />}
      {open === 'depot' && <DepotSheet svEarned={game.svEarned} cosmeticSlots={game.cosmeticSlots} onClose={() => setOpen(null)} />}
      {open === 'ledger' && <LedgerSheet game={game} onClose={() => setOpen(null)} />}
    </>
  );
}

function TabButton({ tab, fallback, text, onClick, testId }: { tab: ControlBarTab; fallback: ReactNode; text: string; onClick: () => void; testId: string }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#112643]/70 hover:bg-[#1e3459] border border-[#1E3559] text-[#afc6ff] hover:text-white text-xs font-bold cursor-pointer"
    >
      <AssetImage src={tabIconUrl(tab)} alt="" className="h-4 w-4 shrink-0" fallback={fallback} /> {text}
    </button>
  );
}
