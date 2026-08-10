'use client';

import { useTranslations } from 'next-intl';
import SheetShell from './SheetShell';

// docs/specs/deep-core-03-credits-and-depot-frd.md — Outfitting (SV) tab ONLY.
// The Maintenance (CC) tab is P1-gated and is not rendered here at all — not
// even disabled (00 §6.5 Q4: "자리만 비워두는 것도 금지").
//
// Purchasing is catalog/browse-only for now: `03 §6` specs a `GameLedgerEntry`
// write for a real purchase, which needs the schema handoff
// (docs/specs/deep-core-p0-schema-handoff.md) this pass leaves for
// `prisma-db-expert`. SV balance shown here is a real, derived,
// earned-to-date total (`deepCoreProgress.ts`) — only the *spend* action is
// pending.
const SV_TIERS: { key: string; price: number }[] = [
  { key: 'basic', price: 200 },
  { key: 'standard', price: 500 },
  { key: 'stratumLimited', price: 800 },
  { key: 'coreLog', price: 1200 },
];

export default function DepotSheet({ svEarned, cosmeticSlots, onClose }: { svEarned: number; cosmeticSlots: string[]; onClose: () => void }) {
  const t = useTranslations('staking.game');

  return (
    <SheetShell title={t('depot.title')} onClose={onClose}>
      <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#112643]/60 border border-[#1E3559]">
        <span className="text-xs font-mono text-[#8c90a0]">{t('depot.tabOutfitting')}</span>
        <span data-testid="deep-core-sv-balance" className="text-sm font-mono font-bold text-[#afc6ff]">{t('depot.balanceSV', { n: svEarned })}</span>
      </div>

      {cosmeticSlots.length === 0 ? (
        <p className="text-xs font-mono text-[#8c90a0]">{t('empty.ledgerNone')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {cosmeticSlots.map((slot) => (
            <li key={slot} className="px-3 py-2 rounded-xl bg-[#112643]/40 border border-[#1E3559]/70 text-xs font-mono text-[#d8e2ff]">
              {t(`depot.slot.${slot}`)}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-1 pt-1 border-t border-[#1E3559]/50">
        <span className="text-[10px] font-mono uppercase tracking-wide text-[#8c90a0]">{t('depot.priceTiersTitle')}</span>
        {SV_TIERS.map((tier) => (
          <div key={tier.key} className="flex items-center justify-between text-[11px] font-mono text-[#8c90a0]">
            <span>{t(`depot.tier.${tier.key}`)}</span>
            <span>{tier.price} SV</span>
          </div>
        ))}
      </div>

      <p data-testid="deep-core-purchase-unavailable" className="text-[11px] font-mono text-[#8c90a0] leading-relaxed pt-1 border-t border-[#1E3559]/50">
        {t('depot.purchaseUnavailable')}
      </p>
    </SheetShell>
  );
}
