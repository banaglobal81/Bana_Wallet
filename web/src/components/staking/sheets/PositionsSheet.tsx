'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronRight, Loader2 } from 'lucide-react';
import CoinAvatar from '../../wallet/CoinAvatar';
import WellBadge from '../deep-core/WellBadge';
import SheetShell from './SheetShell';
import { setAutoRenew, type StakePosition, type StakingProduct, type DeepCoreGameState } from '../../../utils/stakingApi';
import { msToMaturity } from '../../../lib/stakingMath';
import { AUTO_RENEW_MAX_TERM_DAYS, fmtDate, outcomeFor, localizeAutoRenewError } from '../renewalCopy';

// docs/specs/staking-page-v2-screen-flow-frd.md §4.5 — S-POS. Carries the
// existing auto-renew toggle / 6-row precedence table / confirm sheet /
// error mapping over from the old inline "My Stakes" section with NO logic
// change (§2.4 hand-off table) — only the display of accrual (PR-1: ledgered
// yield, not a live client-side projection) and progress (PR-2: settled
// days, not elapsed days) changed, per R-U7/AC-V5.

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/25',
  MATURED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
  PAID: 'bg-slate-500/10 text-slate-300 border-slate-500/25',
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
  onPositionsChange,
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
  onPositionsChange: (next: StakePosition[]) => void;
  /** UF-5 (reverse direction) / CH-2 — a position row's well badge was
   *  clicked; the parent closes this sheet and hands the well id to
   *  DeepCoreEmbed's `focusWellId` so the canvas can pan/highlight it. */
  onFocusWell: (positionId: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations('staking');
  const ar = useTranslations('staking.autoRenew');

  const [renewPending, setRenewPending] = useState<string | null>(null);
  const [renewError, setRenewError] = useState<Record<string, string>>({});
  const [confirmFor, setConfirmFor] = useState<StakePosition | null>(null);
  const [toast, setToast] = useState<string | null>(null);
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

  // S2 — one-tap off. Must succeed regardless of eligibility/maintenanceMode
  // (M-3 / copy spec §2.2) — never gated, never confirmed.
  const handleToggleOff = async (p: StakePosition) => {
    setRenewPending(p.id);
    setRenewError((prev) => { const n = { ...prev }; delete n[p.id]; return n; });
    try {
      const updated = await setAutoRenew(p.id, false);
      onPositionsChange(positions.map((x) => (x.id === p.id ? { ...x, ...updated } : x)));
      setToast(ar('offToast', { date: fmtDate(p.maturityAt) }));
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      setRenewError((prev) => ({ ...prev, [p.id]: localizeAutoRenewError(e as Error & { code?: string }, ar, p) }));
    } finally {
      setRenewPending(null);
    }
  };

  // S2 — turning on, only reachable from the confirm sheet.
  const confirmTurnOn = async () => {
    if (!confirmFor) return;
    const p = confirmFor;
    setRenewPending(p.id);
    setRenewError((prev) => { const n = { ...prev }; delete n[p.id]; return n; });
    try {
      const updated = await setAutoRenew(p.id, true);
      onPositionsChange(positions.map((x) => (x.id === p.id ? { ...x, ...updated } : x)));
      setConfirmFor(null);
    } catch (e) {
      setRenewError((prev) => ({ ...prev, [p.id]: localizeAutoRenewError(e as Error & { code?: string }, ar, p) }));
    } finally {
      setRenewPending(null);
    }
  };

  // S2 — position row auto-renew state (6-row precedence table, copy spec §1.3).
  const renderAutoRenewRow = (p: StakePosition) => {
    if (p.status !== 'ACTIVE') return null;

    const overCap = p.termDays > AUTO_RENEW_MAX_TERM_DAYS;
    const grantedIneligible = !p.autoRenewEligible && !overCap;

    // Row 1 — not eligible, off: render nothing at all.
    if (!p.autoRenewEligible && !p.autoRenew) return null;

    const productOpen = products.some((pr) => pr.id === p.productId);
    const pending = renewPending === p.id;
    const err = renewError[p.id];

    let label: string;
    let toneClass = 'text-[#8c90a0]';
    if (p.autoRenew && grantedIneligible) {
      label = ar('stateOnGranted', { date: fmtDate(p.maturityAt) });
    } else if (p.autoRenew && overCap) {
      label = ar('stateOnOverCap', { maxTermDays: AUTO_RENEW_MAX_TERM_DAYS, date: fmtDate(p.maturityAt) });
    } else if (p.autoRenew && !productOpen) {
      label = ar('stateOnClosed');
    } else if (p.autoRenew) {
      label = ar('stateOn', { date: fmtDate(p.maturityAt) });
      toneClass = 'text-[#afc6ff]';
    } else {
      label = ar('stateOff');
    }

    const onToggle = () => (p.autoRenew ? handleToggleOff(p) : setConfirmFor(p));

    return (
      <div className="flex flex-col gap-1 mt-1 pt-2 border-t border-[#1E3559]/40">
        <div className="flex items-center justify-between gap-3">
          <span data-testid="autorenew-label" className={`text-[11px] font-mono ${toneClass}`}>{label}</span>
          <button
            type="button"
            data-testid="autorenew-toggle"
            disabled={pending}
            aria-pressed={p.autoRenew}
            onClick={onToggle}
            className={`w-10 h-6 rounded-full p-0.5 transition-colors duration-300 relative cursor-pointer outline-none border shrink-0 disabled:opacity-50 ${
              p.autoRenew ? 'bg-[#2E7DFF]/15 border-[#528dff]/40' : 'bg-[#020d24] border-[#1E3559]'
            }`}
          >
            <div className={`w-5 h-5 rounded-full transition-all duration-300 absolute top-0.5 ${
              p.autoRenew ? 'right-0.5 bg-[#528dff]' : 'left-0.5 bg-[#4a5568]'
            }`} />
          </button>
        </div>
        {err && <span data-testid="autorenew-error" className="text-[10px] font-mono text-rose-400">{err}</span>}
      </div>
    );
  };

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
                      <div className="text-[11px] font-mono text-[#8c90a0]">{t('position.settledDays', { d: p.daysPaid, total: p.termDays })} · {p.dailyRatePct}% {t('dailyRate')}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-5 shrink-0">
                    <div className="text-right">
                      {/* PR-1 — server-ledgered recorded yield (paidInterest), never a
                          live ticking projection (R-U7 / AC-V5). */}
                      <div data-testid="position-recorded" className="text-sm font-bold text-emerald-400 font-mono">+{p.paidInterest}</div>
                      <div className="text-[10px] font-mono text-[#8c90a0] uppercase tracking-wide">{t('position.recordedLabel')}</div>
                    </div>
                    <div className="text-right min-w-[92px]">
                      {/* A countdown clock is allowed (L-4 — time, not money). */}
                      <div className="text-xs font-mono text-[#d8e2ff]">{p.status === 'ACTIVE' ? fmtCountdown(remainingMs) : '—'}</div>
                      <span className={`inline-block mt-1 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[p.status]}`}>{t(`status${p.status}` as 'statusACTIVE')}</span>
                    </div>
                  </div>
                </div>
                {renderAutoRenewRow(p)}
                {renderMaturedOutcome(p)}
              </div>
            );
          })}
          <p className="text-[11px] font-mono text-[#8c90a0] px-1">{t('position.maturedNote')}</p>
        </div>
      )}

      {/* S2 — confirm sheet, shown only when turning auto-renew ON. */}
      {confirmFor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div data-testid="autorenew-confirm-sheet" className="w-full max-w-sm rounded-2xl bg-[#0b1220] border border-[#1E3559] p-6 flex flex-col gap-3 shadow-2xl">
            <h2 className="text-base font-extrabold text-white">{ar('confirmTitle')}</h2>
            <p className="text-xs font-mono text-[#8c90a0] leading-relaxed">
              {ar('confirmBody1', {
                maturityDate: fmtDate(confirmFor.maturityAt),
                principal: confirmFor.principal,
                coin: confirmFor.coin,
                productName: confirmFor.productName,
                termDays: confirmFor.termDays,
              })}
            </p>
            <p data-testid="autorenew-confirm-lock" className="text-xs font-bold text-amber-300 leading-relaxed">{ar('confirmLock')}</p>
            <p className="text-xs font-mono text-[#8c90a0] leading-relaxed">{ar('confirmBody2')}</p>
            <p className="text-xs font-mono text-[#8c90a0] leading-relaxed">{ar('confirmBody3', { maturityDate: fmtDate(confirmFor.maturityAt) })}</p>
            {renewError[confirmFor.id] && <p className="text-[11px] font-mono text-rose-400">{renewError[confirmFor.id]}</p>}
            <div className="flex gap-2 mt-1">
              <button disabled={renewPending === confirmFor.id} onClick={() => setConfirmFor(null)} className="flex-1 py-2.5 rounded-xl bg-[#020d24]/60 hover:bg-[#112643] text-[#8c90a0] hover:text-white text-sm font-bold border border-[#1E3559]/80 cursor-pointer disabled:opacity-50">{ar('confirmCancel')}</button>
              <button disabled={renewPending === confirmFor.id} onClick={confirmTurnOn} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#2E7DFF] to-[#528dff] hover:brightness-110 text-white font-bold text-sm border border-[#528dff]/40 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5">
                {renewPending === confirmFor.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {ar('confirmYes')}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div data-testid="autorenew-toast" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-xl bg-[#112643] border border-[#1E3559] text-xs font-mono text-[#d8e2ff] shadow-lg">
          {toast}
        </div>
      )}
    </SheetShell>
  );
}
