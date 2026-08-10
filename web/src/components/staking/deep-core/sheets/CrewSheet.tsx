'use client';

import { useTranslations } from 'next-intl';
import { UserRound } from 'lucide-react';
import SheetShell from './SheetShell';
import type { CrewState } from '../scene/DeepCoreScene';
import { CREW_IDS, type CrewId } from '@/lib/deepCoreChapters';
import AssetImage from '../AssetImage';
import { crewPortraitUrl } from '../assetManifest';

export default function CrewSheet({ crewState, onClose }: { crewState: Record<string, CrewState>; onClose: () => void }) {
  const t = useTranslations('staking.game');
  const joined = CREW_IDS.filter((id) => crewState[id] != null);

  return (
    <SheetShell title={t('crew.title')} onClose={onClose}>
      {joined.length === 0 ? (
        <p className="text-xs font-mono text-[#8c90a0]">{t('empty.ledgerNone')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {joined.map((id) => (
            <li key={id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#112643]/60 border border-[#1E3559]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 shrink-0 rounded-full overflow-hidden bg-[#0b1220] border border-[#1E3559] flex items-center justify-center">
                  <AssetImage
                    src={crewPortraitUrl(id as CrewId)}
                    alt={t(`crew.${id}.name`)}
                    className="h-full w-full object-cover"
                    fallback={<UserRound className="h-5 w-5 text-[#8c90a0]" />}
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white">{t(`crew.${id}.name`)}</div>
                  <div className="text-[11px] font-mono text-[#8c90a0]">{t(`crew.${id}.role`)}</div>
                </div>
              </div>
              <span className="text-[10px] font-mono uppercase tracking-wide px-2 py-1 rounded-full border border-[#1E3559] text-[#afc6ff] shrink-0">
                {t(`crew.state.${crewState[id]}`)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SheetShell>
  );
}
