'use client';

// docs/specs/referral-panel-relocation-frd.md — `ReferralPanel` relocated off
// `/staking` (RT-1 / L1, oil-drilling-staking-game-realtime-decision.md §1).
// This is a relocation, not a redesign: `ReferralPanel` ships with a
// zero-line diff (RF-3 / AC-2). The only new content here is page chrome —
// one <h1> and one factual <p> subtitle, both from next-intl (§3.2 table).
//
// No new disclosure/disclaimer copy is added (RF-F3, open item for pm — see
// the FRD §5.4/§9). No new inputs, no new mutation, no new API route (AC-16).
import { useTranslations } from 'next-intl';
import ReferralPanel from '@/components/ReferralPanel';

export default function ReferralPage() {
  const t = useTranslations('referral');

  return (
    <div
      data-testid="referral-page"
      className="bana-page flex-1 min-h-full bg-[#06132a] text-[#d8e2ff] p-4 sm:p-6 lg:p-8 flex flex-col gap-6 overflow-y-auto"
    >
      <header className="pb-2 border-b border-[#1E3559]/40">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
          {t('pageTitle')}
        </h1>
        <p className="text-xs sm:text-sm text-[#8c90a0] mt-1 font-mono">{t('subtitle')}</p>
      </header>

      <ReferralPanel />
    </div>
  );
}
