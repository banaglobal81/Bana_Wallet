'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Decimal from 'decimal.js';
import { useTranslations } from 'next-intl';
import { Loader2, Lock, Check, CircleSlash, RefreshCw, ChevronRight } from 'lucide-react';
import CoinAvatar from '../../wallet/CoinAvatar';
import SheetShell from './SheetShell';
import { fullInterest } from '../../../lib/stakingMath';
import type { StakingProduct } from '../../../utils/stakingApi';
import type { StakeEntryState } from '../stakeEntryState';

// docs/specs/staking-yield-system-v2-design-t8-stake-flow-frd.md §4/§5/§6/§7 —
// S-STAKE, V2 cutover. 3-step flow; no request goes out before STEP 3's
// confirm (PS-A's own wording, unchanged by this cutover). §3.4's own
// render matrix governs this file: STEP 1 can always be opened (the entry
// state banner + read-only product cards render for every non-READY state,
// §3.4), but STEP 2 (amount entry) is reachable ONLY when `entryState.kind
// === 'READY'` (AC-T8-06 — "no input field renders" in any other state).
type Step = 1 | 2 | 3;

// §7.2 — error codes whose transition is "back to STEP 1 + reload the list"
// (the sheet's own state block, not a re-derived local guess, then shows the
// right E-1..E-6 banner once `onReload` resolves).
const STEP1_RESET_CODES = new Set([
  'STAKE_PATH_MIGRATING',
  'STAKE_COIN_HALTED', 'STAKE_COIN_T1_WARNING',
  'STAKE_COIN_AUTHORITY_CHANGE_IN_PROGRESS', 'STAKE_COIN_AUTHORITY_TRANSITION_IN_PROGRESS',
  'STAKE_PRODUCT_CLOSED', 'STAKE_PRODUCT_FULL', 'STAKE_PRODUCT_NOT_FOUND',
]);
// §7.2 — "reload balance, re-evaluate; STEP 2 if still possible, else the
// LOCKED_OUT/NO_FUNDS block picks it up via the entryState effect below."
const RELOAD_STAY_ON_STEP2_CODES = new Set(['STAKE_INSUFFICIENT_LOCAL_BALANCE', 'STAKE_INSUFFICIENT_AVAILABLE']);

/** §5 — the entry-state banner shown above the product grid on STEP 1 for
 *  every state except READY/LOADING. Each branch renders the FRD's own
 *  literal 6-locale copy (§9.1) — no new sentences invented here. */
function EntryStateBanner({
  state,
  t,
  onReload,
  onOpenPositions,
}: {
  state: StakeEntryState;
  t: ReturnType<typeof useTranslations>;
  onReload: () => void;
  onOpenPositions: () => void;
}) {
  if (state.kind === 'READY') return null;

  if (state.kind === 'LOADING') {
    return (
      <div className="flex items-center gap-2.5 py-6 justify-center">
        <Loader2 className="h-5 w-5 text-[#528dff] animate-spin" />
        <span className="text-sm text-[#8c90a0]">{t('loading')}</span>
      </div>
    );
  }

  // AC-T8-01/AC-T8-05 — every non-READY state renders the same non-button
  // "chipUnavailable" chip (S-2: not a disabled button — no false promise).
  const Chip = (
    <span
      data-testid="stake-entry-chip"
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1E3559]/60 border border-[#1E3559] text-[11px] font-bold text-[#8c90a0] w-fit"
    >
      <CircleSlash className="h-3 w-3" /> {t('stakeEntry.chipUnavailable')}
    </span>
  );

  let title: string | null = null;
  let bodyLines: string[] = [];
  let action: ReactNode = null;

  switch (state.kind) {
    case 'MIGRATING':
      title = t('stakeEntry.migratingTitle');
      bodyLines = [t('stakeEntry.migratingBody')];
      break;
    case 'HALTED':
      title = t('stakeEntry.haltedTitle', { coin: state.coin });
      bodyLines = [t('stakeEntry.haltedBody', { coin: state.coin })];
      break;
    case 'NO_OFFERS':
      // EA-1 — reuses the existing `staking.noProducts` key verbatim (no new
      // string), per the FRD's own instruction not to duplicate this copy.
      bodyLines = [t('noProducts')];
      break;
    case 'BALANCE_UNKNOWN':
      // SB-6/SB-8 — never rendered as "0"; [Reload] re-fetches the same
      // read, it is not a submission retry (AC-T8-24).
      bodyLines = [t('stakeEntry.balanceUnknown', { coin: state.coin })];
      action = (
        <button
          type="button"
          onClick={onReload}
          className="self-start flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#112643] hover:bg-[#1e3459] border border-[#1E3559] text-[#528dff] hover:text-white text-xs font-bold cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5" /> {t('stakeEntry.reload')}
        </button>
      );
      break;
    case 'LOCKED_OUT': {
      // EL-1/EL-3/LB-1 — both lines render together when both holds are
      // nonzero; a third ("other") hold gets its own line too, never folded
      // into either known bucket.
      title = t('stakeEntry.lockedOutTitle', { coin: state.coin });
      const lines: string[] = [];
      if (new Decimal(state.stakePrincipal).gt(0)) {
        lines.push(t('stakeEntry.lockedOutBody', { amount: state.stakePrincipal, coin: state.coin }));
      }
      if (new Decimal(state.withdrawalPending).gt(0)) {
        lines.push(t('stakeEntry.lockedOutBodyWithdrawal', { amount: state.withdrawalPending, coin: state.coin }));
      }
      if (new Decimal(state.other).gt(0)) {
        lines.push(t('stakeEntry.lockedOutBody', { amount: state.other, coin: state.coin }));
      }
      bodyLines = lines;
      action = (
        <button
          type="button"
          onClick={onOpenPositions}
          className="self-start flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#112643] hover:bg-[#1e3459] border border-[#1E3559] text-[#528dff] hover:text-white text-xs font-bold cursor-pointer"
        >
          {t('sheet.positionsTitle')} <ChevronRight className="h-3.5 w-3.5" />
        </button>
      );
      break;
    }
    case 'NO_FUNDS':
      // EB-1 — exactly four sentences, in order: ① what ② how much now
      // ③ (conditional, S-3/AC-T8-11) no way to add more ④ terms are below.
      title = t('stakeEntry.noFundsTitle', { coin: state.coin });
      bodyLines = [
        t('stakeEntry.noFundsBalance', { available: state.available, coin: state.coin }),
        ...(state.showNoPath ? [t('stakeEntry.noFundsNoPath', { coin: state.coin })] : []),
        t('stakeEntry.noFundsTerms'),
      ];
      break;
    default:
      return null;
  }

  return (
    <div data-testid="stake-entry-state" className="flex flex-col gap-2 p-4 rounded-2xl bg-[#1E3559]/30 border border-[#1E3559]">
      {Chip}
      {title && <p className="text-sm font-bold text-white">{title}</p>}
      {bodyLines.map((line, i) => (
        <p key={i} className="text-xs font-mono text-[#8c90a0] leading-relaxed">{line}</p>
      ))}
      {action}
    </div>
  );
}

export default function StakeSheet({
  products,
  entryState,
  availableFor,
  yieldRailFor,
  onSubmit,
  onReload,
  onOpenPositions,
  onClose,
}: {
  products: StakingProduct[];
  entryState: StakeEntryState;
  availableFor: (coin: string) => Decimal;
  /** CP1-2 — whether ⓓ `claimSeparate` is still a true sentence for this coin. */
  yieldRailFor: (coin: string) => 'LEDGER_ONLY' | 'CLAIM_LIVE' | undefined;
  /** Throws a *localized* Error (the caller maps the server's stable error
   *  code first) that also carries `.code` so this sheet can pick the right
   *  §7.2 transition. */
  onSubmit: (productId: string, amount: string) => Promise<void>;
  /** Re-run the page's own `load()` — used both for the manual [Reload]
   *  affordance and after an error that requires re-evaluating entry state
   *  (§7.2). Never a resubmission of the stake request itself. */
  onReload: () => Promise<void>;
  onOpenPositions: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('staking');

  const [step, setStep] = useState<Step>(1);
  const [product, setProduct] = useState<StakingProduct | null>(null);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const ready = entryState.kind === 'READY';

  const amtDec = (() => { try { return new Decimal(amount || 0); } catch { return new Decimal(0); } })();
  const avail = product ? availableFor(product.coin) : new Decimal(0);

  // §7.2 last row / §3.4 — if a background reload (triggered by an error, or
  // simply the page's own poll) turns up a non-READY entry state while the
  // user is on STEP 2, bounce back to STEP 1 rather than leaving an amount
  // field open on a promise the screen can no longer keep.
  useEffect(() => {
    if (step === 2 && !ready) setStep(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryState.kind]);

  const openStep2 = (p: StakingProduct) => {
    if (!ready || p.full) return;
    setProduct(p); setAmount(''); setError(null); setErrorCode(null); setStep(2);
  };

  const maxFill = () => {
    if (!product) return;
    let v = avail;
    if (product.maxAmount) v = Decimal.min(v, new Decimal(product.maxAmount));
    setAmount(v.toFixed());
  };

  const handleConfirm = async () => {
    if (!product) return;
    setSubmitting(true); setError(null); setErrorCode(null);
    try {
      await onSubmit(product.id, amtDec.toFixed());
      setDone(true);
      setTimeout(onClose, 1500);
    } catch (e) {
      const err = e as Error & { code?: string };
      setError(err.message);
      setErrorCode(err.code ?? null);
      if (STEP1_RESET_CODES.has(err.code ?? '') || RELOAD_STAY_ON_STEP2_CODES.has(err.code ?? '')) {
        await onReload();
      }
      if (STEP1_RESET_CODES.has(err.code ?? '')) {
        setStep(1);
      } else if (RELOAD_STAY_ON_STEP2_CODES.has(err.code ?? '')) {
        // Stays on STEP 2 with the input preserved; the entryState effect
        // above bounces to STEP 1 automatically if the reload now shows
        // LOCKED_OUT/NO_FUNDS (§7.2: "E-5/E-6이면 그 블록으로").
        setStep(2);
      }
      // UNAUTHENTICATED / GENERIC / unmapped — stays on STEP 3, sheet and
      // input preserved (§7.2 last row): the request may not have completed,
      // and this screen does not know either way, so it never asserts
      // "did not complete" and never offers a resend button (AC-T8-24) —
      // only the manual [Reload] rendered below the error.
    } finally {
      setSubmitting(false);
    }
  };

  const title = step === 1 ? t('sheet.stakeTitle') : step === 2 ? t('sheet.amountTitle') : t('sheet.confirmTitle');

  // CP1-10 — fail-closed: an absent `autoRenewRail` reads as `'UNAVAILABLE'`,
  // i.e. ⓕ renders. This also covers today's reality (the field isn't served
  // by /api/staking/products yet — see the report to the parent agent).
  const autoRenewLive = product?.autoRenewRail === 'LIVE';
  const yieldRail = product ? yieldRailFor(product.coin) : undefined;

  return (
    <SheetShell title={title} step={t('sheet.step', { current: step, total: 3 })} onClose={onClose}>
      {done ? (
        <div data-testid="stake-success" className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-sm font-bold">
          {/* CP1-6 — one line, no animation/sound/celebration (LA-8): a
              contract was recorded, not a reward earned. */}
          <Check className="h-4 w-4" /> {t('stakeSuccess')}
        </div>
      ) : step === 1 ? (
        <div className="flex flex-col gap-3">
          <EntryStateBanner state={entryState} t={t} onReload={onReload} onOpenPositions={onOpenPositions} />
          {entryState.kind !== 'NO_OFFERS' && entryState.kind !== 'LOADING' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {products.map((p) => {
                const clickable = ready && !p.full;
                return (
                  <div
                    key={p.id}
                    data-testid="stake-product-card"
                    role={clickable ? 'button' : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    onClick={clickable ? () => openStep2(p) : undefined}
                    onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') openStep2(p); } : undefined}
                    // EB-7 — read-only product cards render at full opacity;
                    // dimming a state a user cannot fix would make the terms
                    // harder to read, which is the opposite of the point.
                    className={`text-left bg-[#1E3559]/40 border border-[#1E3559] rounded-lg p-3 space-y-2 transition-colors ${
                      clickable ? 'hover:border-[#2E7DFF] hover:bg-[#1E3559]/60 cursor-pointer' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <CoinAvatar symbol={p.coin} size={24} />
                      <span className="text-sm font-semibold text-white truncate">{p.name}</span>
                    </div>
                    {/* Non-band product: single daily rate. No band meter —
                        this launch has no band program at all
                        (bandProgram = OFF), so a meter component is never
                        built here (L-8). */}
                    <div className="text-base font-mono text-[#2E7DFF]">{t('dailyRate')}: {p.baseDailyRatePct}%</div>
                    <div className="text-xs text-[#8c90a0]">{t('term')}: {t('daysN', { n: p.termDays })}</div>
                    {(p.minAmount || p.maxAmount) && (
                      <div className="text-xs text-[#8c90a0]">
                        {p.minAmount ? `${t('min')} ${p.minAmount}` : ''}{p.minAmount && p.maxAmount ? ' · ' : ''}{p.maxAmount ? `${t('max')} ${p.maxAmount}` : ''} {p.coin}
                      </div>
                    )}
                    {p.full && <span className="inline-block text-xs font-semibold text-rose-400 bg-rose-500/10 px-2 py-1 rounded">{t('full')}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : step === 2 && product && ready ? (
        <div className="flex flex-col gap-3">
          <div className="flex justify-between text-xs font-mono text-[#8c90a0]">
            <span>{t('amount')}</span>
            <span>{t('available')}: {avail.toFixed()} {product.coin}</span>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-xl bg-[#020d24]/70 border border-[#1E3559]">
            <input
              value={amount}
              onChange={(e) => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v); }}
              placeholder="0.00"
              inputMode="decimal"
              className="bg-transparent text-lg font-bold font-mono text-white focus:outline-none w-full min-w-0"
            />
            {/* SB-5 — [Max] fills min(available, maxAmount), never `available`
                alone when a smaller cap exists; the number is its own
                explanation (no extra sentence). */}
            <button type="button" onClick={maxFill} className="px-2 py-1 bg-[#112643] hover:bg-[#1e3459] border border-[#1E3559] text-[#528dff] rounded text-[10px] font-bold cursor-pointer shrink-0">
              {t('max')}
            </button>
            <span className="font-mono text-sm text-[#afc6ff] font-bold shrink-0">{product.coin}</span>
          </div>

          {/* §4.2 — "스테이킹은 입출금 계정과 별개인 BANA 잔고에서 예치합니다." */}
          <p className="text-[11px] font-mono text-[#8c90a0] leading-relaxed">{t('stakeSheet.balanceSource', { coin: product.coin })}</p>

          {/* Contract terms — a single deterministic figure derived from the
              contracted rate × principal × term (L-4: allowed, this is not a
              forecast). Never a mid-range/projected estimate. CP1-8: the same
              sentence STEP 3 repeats verbatim. */}
          {amtDec.gt(0) && (
            <div className="text-xs text-[#8c90a0] bg-[#1E3559]/40 p-3 rounded space-y-1">
              <p>{t('stakeSheet.contractTerms', {
                days: product.termDays,
                baseTotal: fullInterest(amtDec.toFixed(), product.baseDailyRatePct, product.termDays).toFixed(),
                coin: product.coin,
              })}</p>
              <p>{t('stakeSheet.notEstimate')}</p>
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={() => setStep(1)} className="px-4 py-2.5 rounded-xl bg-[#020d24]/60 hover:bg-[#112643] text-[#8c90a0] hover:text-white text-sm font-bold border border-[#1E3559]/80 cursor-pointer">
              {t('sheet.back')}
            </button>
            <button
              type="button"
              disabled={amtDec.lte(0) || amtDec.gt(avail)}
              onClick={() => setStep(3)}
              className="flex-1 py-2.5 rounded-xl bg-[#2E7DFF]/90 hover:bg-[#2E7DFF] text-white font-bold text-sm border border-[#2E7DFF] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('confirmStake')}
            </button>
          </div>
        </div>
      ) : step === 3 && product ? (
        <div className="flex flex-col gap-4">
          <div className="bg-[#1E3559]/40 border border-[#1E3559] rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[#8c90a0]">{t('amount')}</span><span className="font-mono text-white">{amtDec.toFixed()} {product.coin}</span></div>
            <div className="flex justify-between"><span className="text-[#8c90a0]">{t('term')}</span><span className="font-mono text-white">{t('daysN', { n: product.termDays })}</span></div>
            <div className="flex justify-between"><span className="text-[#8c90a0]">{t('dailyRate')}</span><span className="font-mono text-white">{product.baseDailyRatePct}%</span></div>
          </div>

          {/* §6.2 — ⓐ~ⓕ, in this exact order, none collapsed/tooltipped
              (CP1-1/CP1-9). CP1-8: contractTerms repeats STEP 2's sentence
              verbatim. */}
          <div className="flex flex-col gap-2 text-xs font-mono text-[#8c90a0] leading-relaxed">
            <p>{t('stakeSheet.contractTerms', {
              days: product.termDays,
              baseTotal: fullInterest(amtDec.toFixed(), product.baseDailyRatePct, product.termDays).toFixed(),
              coin: product.coin,
            })}</p>
            <p>{t('stakeSheet.notEstimate')}</p>
            <p className="pt-1 border-t border-[#1E3559]/50">{t('stakeSheet.principalStays')}</p>
            <p className="font-bold text-amber-300">{t('stakeSheet.lockNote', { coin: product.coin })}</p>
            <p>{t('stakeSheet.recordedNotPaid', { coin: product.coin })}</p>
            {/* CP1-2 — conditional on yieldRail; disappears the day claim goes live. */}
            {yieldRail !== 'CLAIM_LIVE' && <p>{t('stakeSheet.claimSeparate', { coin: product.coin })}</p>}
            <p>{t('stakeSheet.maturityNote', { coin: product.coin })}</p>
            {/* CP1-10 — conditional on autoRenewRail; fail-closed default renders it. */}
            {!autoRenewLive && <p data-testid="stake-no-restake">{t('stakeSheet.noRestake')}</p>}
          </div>

          {error && (
            <div className="flex flex-col gap-1.5">
              <span data-testid="stake-error" className="text-[11px] text-rose-400 font-mono">{error}</span>
              {/* §7.2 last row / ER-6 — a manual [Reload], never a resend of
                  the stake request itself, for the unmapped/GENERIC case
                  (including a totally uncoded network failure, `errorCode
                  === null`). */}
              {!(errorCode && (STEP1_RESET_CODES.has(errorCode) || RELOAD_STAY_ON_STEP2_CODES.has(errorCode))) && (
                <button
                  type="button"
                  onClick={() => onReload()}
                  className="self-start flex items-center gap-1.5 text-[11px] font-bold text-[#528dff] hover:text-white cursor-pointer"
                >
                  <RefreshCw className="h-3 w-3" /> {t('stakeEntry.reload')}
                </button>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" disabled={submitting} onClick={() => setStep(2)} className="px-4 py-2.5 rounded-xl bg-[#020d24]/60 hover:bg-[#112643] text-[#8c90a0] hover:text-white text-sm font-bold border border-[#1E3559]/80 cursor-pointer disabled:opacity-50">
              {t('sheet.back')}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handleConfirm}
              className="flex-1 py-2.5 rounded-xl bg-[#2E7DFF]/90 hover:bg-[#2E7DFF] text-white font-bold text-sm border border-[#2E7DFF] cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} {t('confirmStake')}
            </button>
          </div>
        </div>
      ) : null}
    </SheetShell>
  );
}
