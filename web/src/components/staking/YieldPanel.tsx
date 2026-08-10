'use client';

import { useTranslations } from 'next-intl';
import CoinAvatar from '../wallet/CoinAvatar';
import ClaimSlot from './ClaimSlot';

// docs/specs/staking-page-v2-screen-flow-frd.md §4.2 — B2 YIELD PANEL.
// PS-A only (docs/patterns/staking-v2-implementation-guide.md hand-off):
// ① = server-ledgered recorded yield, ② = 0 (no claim rail exists yet),
// ③ = server-computed locked principal (never recomputed client-side, §7 R-D2).
// The claim slot only ever renders UNAVAILABLE — DISABLED/ENABLED are a
// PS-B render path this file deliberately does not build (§11.2).

export interface YieldPanelRow {
  coin: string;
  /** ① — server SUM(paidInterest), a decimal string. Never client-recomputed (R-U7). */
  ledgered: string;
  /** ② — always "0" in PS-A: no claim rail exists to have moved anything to the wallet yet. */
  claimed: string;
  /** ③ — server `lockedPrincipal[coin]`, a decimal string (§7 R-D2). */
  locked: string;
}

export default function YieldPanel({ rows }: { rows: YieldPanelRow[] }) {
  const t = useTranslations('staking');

  return (
    <section data-testid="yield-panel" className="bg-[#112643]/70 border border-[#1E3559] rounded-lg p-4 sm:p-6 space-y-4">
      {rows.length === 0 ? (
        <p className="text-sm text-[#8c90a0] text-center py-2">{t('yield.empty')}</p>
      ) : (
        rows.map((row) => (
          <div key={row.coin} className="space-y-3 border-b border-[#1E3559]/50 pb-3 last:border-b-0 last:pb-0">
            <div className="flex items-center gap-2">
              <CoinAvatar symbol={row.coin} size={20} />
              <span className="text-sm font-medium text-white">{row.coin}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <YieldValueBox label={t('yield.recordedLabel')} help={t('yield.recordedHelp')} value={row.ledgered} testId="yield-recorded" />
              <YieldValueBox label={t('yield.claimedLabel')} help={t('yield.claimedHelp')} value={row.claimed} testId="yield-claimed" />
              <YieldValueBox label={t('yield.lockedLabel')} help={t('yield.lockedHelp')} value={row.locked} testId="yield-locked" />
            </div>

            {/* Claim slot — UNAVAILABLE only (PS-A / A-7 §4 intro: "이 절을
                근거로 클레임 버튼을 만들지 않는다"). ClaimSlot itself
                implements the full DISABLED/ENABLED/in-flight/state-refresh
                machine (A-7 CLM-1~CLM-10) for the day yieldRail flips to
                CLAIM_LIVE, but no caller in this codebase passes anything
                but "UNAVAILABLE" yet — no [Details] link either: the S-INFO
                sheet body depends on an unresolved human/legal decision
                (H-6), so no link is rendered until that lands (FRD §3.3 —
                "빈 시트를 여는 것보다 낫다"). */}
            <ClaimSlot coin={row.coin} state="UNAVAILABLE" claimableAmount={row.ledgered} />
          </div>
        ))
      )}
    </section>
  );
}

function YieldValueBox({ label, help, value, testId }: { label: string; help: string; value: string; testId: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-[#8c90a0] uppercase tracking-wide">{label}</div>
      {/* Server decimal string, rendered as-is — no locale/precision reformatting (N-3). */}
      <div data-testid={testId} className="text-base sm:text-lg font-mono text-white">{value}</div>
      <p className="text-xs text-[#8c90a0]/70 leading-tight">{help}</p>
    </div>
  );
}
