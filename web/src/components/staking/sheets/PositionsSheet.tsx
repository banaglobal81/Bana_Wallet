'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';
import CoinAvatar from '../../wallet/CoinAvatar';
import WellBadge from '../deep-core/WellBadge';
import SheetShell from './SheetShell';
import type { StakePosition, StakingProduct, DeepCoreGameState } from '../../../utils/stakingApi';
import { msToMaturity } from '../../../lib/stakingMath';
import { outcomeFor } from '../renewalCopy';

// docs/specs/staking-page-v2-screen-flow-frd.md §4.5 — S-POS.
//
// staking-v2-auto-renew-cutover-ruling.md R-AR-3 + T-8 FRD AR-5 — the
// standing auto-renew on/off TOGGLE (turn-on confirm sheet, turn-off
// one-tap, the 6-row precedence label) is removed from this screen: while
// `AUTO_RENEW_V2_ENABLED=false`, every V2 position is
// `autoRenewEligible=true` / `autoRenew=false` (no code path sets it
// otherwise — see `lib/staking.ts`'s `serializePositionV2`), so the toggle
// this file used to render was reachable and would always end in a 409
// `AUTO_RENEW_UNAVAILABLE` after the confirm step — exactly the "active
// control, guaranteed failure" shape R-AR-3 forbids (the same judgment
// S-STAKE's own STEP 2 checkbox removal makes, applied here per AR-5's
// explicit hand-off). The per-position renewal OUTCOME line
// (`renderMaturedOutcome`, below) is left in place: it is purely a read of
// `renewalStatus`, which the server also guarantees stays `'NONE'` while the
// engine is off, so it already renders nothing today — no control, no
// request, nothing to remove — and T-20 can turn it back on by shipping the
// engine alone, no screen change required.
const STATUS_STYLE: Record<string, string> = {
  ACTIVE: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/25',
  MATURED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
};

function fmtCountdown(ms: number): string {
  if (ms <= 0) return '0d 0h 0m';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

export default function PositionsSheet({
  positions,
  products,
  gameState,
  now,
  focusPositionId,
  onClearFocus,
  onFocusWell,
  onClose,
}: {
  positions: StakePosition[];
  products: StakingProduct[];
  gameState: DeepCoreGameState | null;
  now: number;
  /** UF-5 — a well clicked on the canvas opens this sheet focused on its position. */
  focusPositionId: string | null;
  onClearFocus: () => void;
  /** UF-5 (reverse direction) / CH-2 — a position row's well badge was
   *  clicked; the parent closes this sheet and hands the well id to
   *  DeepCoreEmbed's `focusWellId` so the canvas can pan/highlight it. */
  onFocusWell: (positionId: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations('staking');
  const ar = useTranslations('staking.autoRenew');

  const [highlightId, setHighlightId] = useState<string | null>(null);

  useEffect(() => {
    if (!focusPositionId) return;
    document.getElementById(`position-${focusPositionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightId(focusPositionId);
    const hideTimer = setTimeout(() => setHighlightId(null), 2000);
    onClearFocus();
    return () => clearTimeout(hideTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPositionId]);

  // S2 — matured position, single outcome line.
  const renderMaturedOutcome = (p: StakePosition) => {
    if (p.status !== 'MATURED' || p.renewalStatus === 'NONE' || p.renewalStatus === 'FAILED_ACCOUNT_INACTIVE') return null;
    const { heading, body, renewed, successor } = outcomeFor(p, positions, products, ar);
    return (
      <div data-testid="renewal-outcome" className="flex flex-col gap-0.5 mt-1 pt-2 border-t border-[#1E3559]/40">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold text-[#d8e2ff]">{heading}</span>
          {renewed && successor && (
            <button
              type="button"
              onClick={() => document.getElementById(`position-${successor.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              className="text-[#528dff] hover:text-white cursor-pointer shrink-0"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <p className="text-[11px] font-mono text-[#8c90a0] leading-relaxed">{body}</p>
      </div>
    );
  };

  return (
    <SheetShell title={t('sheet.positionsTitle')} onClose={onClose}>
      {positions.length === 0 ? (
        <div className="p-6 rounded-2xl bg-[#1E3559]/30 border border-[#1E3559] text-center text-sm text-[#8c90a0]">{t('noStakes')}</div>
      ) : (
        <div className="flex flex-col gap-3">
          {positions.map((p) => {
            const remainingMs = msToMaturity(p.maturityAt, new Date(now));
            // DEEP CORE — the one badge added to each row (05 §2.6 / G-10).
            const wellIdx = gameState?.wells.findIndex((w) => w.positionId === p.id) ?? -1;
            const isHighlighted = highlightId === p.id;
            return (
              <div
                key={p.id}
                data-testid="staking-position"
                id={`position-${p.id}`}
                className={`p-4 sm:p-5 rounded-2xl bg-[#112643]/70 border flex flex-col gap-1 transition-colors duration-300 ${isHighlighted ? 'border-[#528dff]' : 'border-[#1E3559]'}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <CoinAvatar symbol={p.coin} size={34} />
                    <div className="min-w-0">
                      <div className="font-bold text-white truncate flex items-center gap-2 flex-wrap">
                        <span>{p.principal} {p.coin} <span className="text-[11px] text-[#8c90a0] font-normal">· {p.productName}</span></span>
                        {wellIdx >= 0 && gameState && (
                          <WellBadge
                            seq={wellIdx + 1}
                            chapter={gameState.chapter}
                            onClick={() => onFocusWell(p.id)}
                          />
                        )}
                      </div>
                      {/* PR-2 — settled days (p.daysPaid), never client-computed elapsed days. */}
                      <div className="text-[11px] font-mono text-[#8c90a0]">{t('position.settledDays', { d: p.daysPaid, total: p.termDays })} · {p.baseDailyRatePct}% {t('dailyRate')}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-5 shrink-0">
                    <div className="text-right">
                      {/* PR-1 — server-ledgered recorded yield (ledgeredYield),
                          never a live ticking projection (R-U7 / AC-V5). */}
                      <div data-testid="position-recorded" className="text-sm font-bold text-emerald-400 font-mono">+{p.ledgeredYield}</div>
                      <div className="text-[10px] font-mono text-[#8c90a0] uppercase tracking-wide">{t('position.recordedLabel')}</div>
                    </div>
                    <div className="text-right min-w-[92px]">
                      {/* A countdown clock is allowed (L-4 — time, not money). */}
                      <div className="text-xs font-mono text-[#d8e2ff]">{p.status === 'ACTIVE' ? fmtCountdown(remainingMs) : '—'}</div>
                      <span className={`inline-block mt-1 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[p.status]}`}>{t(`status${p.status}` as 'statusACTIVE')}</span>
                    </div>
                  </div>
                </div>
                {renderMaturedOutcome(p)}
              </div>
            );
          })}
          <p className="text-[11px] font-mono text-[#8c90a0] px-1">{t('position.maturedNote')}</p>
        </div>
      )}
    </SheetShell>
  );
}
