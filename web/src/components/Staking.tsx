'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { useTranslations } from 'next-intl';
import { Screen, SystemSettings } from '../types';
import { Coins, Loader2, Lock, Clock, Check, TrendingUp, ChevronRight, Info, X } from 'lucide-react';
import CoinAvatar from './wallet/CoinAvatar';
import {
  getStakingProducts, getStakePositionsAndGame, getStakingRewards, stake, setAutoRenew,
  type StakingProduct, type StakePosition, type StakingRewards, type DeepCoreGameState,
} from '../utils/stakingApi';
import { getNiaBalance } from '../utils/niaApi';
import { accruedInterest, msToMaturity, daysElapsed } from '../lib/stakingMath';
import DeepCoreEmbed from './staking/deep-core/DeepCoreEmbed';
import WellBadge from './staking/deep-core/WellBadge';

interface StakingProps {
  settings: SystemSettings;
  onNavigate: (toScreen: Screen, direction: 'push' | 'push_back' | 'slide_up' | 'none') => void;
}

// docs/specs/staking-auto-renew-prd.md R-3 / ruling §2.3 — the 90-day cap on
// auto-renew eligibility. The canonical constant lives server-side in
// src/lib/stakingRenew.ts (`AUTO_RENEW_MAX_TERM_DAYS`), which is
// `import 'server-only'` and therefore cannot be imported into this client
// component. Duplicated here as a plain literal per R-3's own wording — "a
// named constant in code", not an env var, not admin-editable. Raising it is
// a visible code change on both sides, never a config flip.
const AUTO_RENEW_MAX_TERM_DAYS = 90;

// S3 — dismissal is per-position localStorage, keyed exactly as PRD §4 S3
// specifies: `bana.renewalNotice.<positionId>`.
const RENEWAL_NOTICE_DISMISS_PREFIX = 'bana.renewalNotice.';
// S3 window: positions with a renewal outcome processed within the last 14 days.
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

function isRenewalNoticeDismissed(positionId: string): boolean {
  if (typeof window === 'undefined') return false;
  try { return window.localStorage.getItem(RENEWAL_NOTICE_DISMISS_PREFIX + positionId) === '1'; } catch { return false; }
}
function dismissRenewalNotices(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try { ids.forEach((id) => window.localStorage.setItem(RENEWAL_NOTICE_DISMISS_PREFIX + id, '1')); } catch { /* ignore */ }
}
function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

// Aggregate free balance per coin from a Nia /wallets payload.
function aggregateBalances(raw: unknown): Map<string, Decimal> {
  const rows: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? Object.values(raw as Record<string, unknown>).flatMap((v) => (Array.isArray(v) ? v : []))
      : [];
  const m = new Map<string, Decimal>();
  for (const r of rows as Array<{ currency?: string; balance?: string }>) {
    if (!r?.currency) continue;
    m.set(r.currency, (m.get(r.currency) ?? new Decimal(0)).plus(new Decimal(r.balance ?? '0')));
  }
  return m;
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return '0d 0h 0m';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

// PATCH .../auto-renew's stable error codes -> the staking.autoRenew.error.*
// keys (copy spec §2.4). AUTO_RENEW_TERM_TOO_LONG needs {termDays} from the
// specific position being acted on, so this takes the position in.
function localizeAutoRenewError(err: Error & { code?: string }, ar: ReturnType<typeof useTranslations>, position: StakePosition): string {
  switch (err.code) {
    case 'INVALID_REQUEST': return ar('error.INVALID_REQUEST');
    case 'POSITION_NOT_FOUND': return ar('error.POSITION_NOT_FOUND');
    case 'POSITION_NOT_ACTIVE': return ar('error.POSITION_NOT_ACTIVE');
    case 'AUTO_RENEW_GRANTED_POSITION': return ar('error.AUTO_RENEW_GRANTED_POSITION');
    case 'AUTO_RENEW_TERM_TOO_LONG': return ar('error.AUTO_RENEW_TERM_TOO_LONG', { maxTermDays: AUTO_RENEW_MAX_TERM_DAYS, termDays: position.termDays });
    default: return err.message || 'Request failed.';
  }
}

export default function Staking({ onNavigate: _onNavigate }: StakingProps) {
  const t = useTranslations('staking');
  const ar = useTranslations('staking.autoRenew');
  const [products, setProducts] = useState<StakingProduct[]>([]);
  const [positions, setPositions] = useState<StakePosition[]>([]);
  const [balances, setBalances] = useState<Map<string, Decimal>>(new Map());
  const [rewards, setRewards] = useState<StakingRewards | null>(null);
  const [gameState, setGameState] = useState<DeepCoreGameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  // Stake flow state
  const [openId, setOpenId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // S1 — always unchecked by default, reset on every open/cancel/submit, never
  // remembered across stakes (PRD §4 S1).
  const [autoRenewChecked, setAutoRenewChecked] = useState(false);

  // S2 — auto-renew toggle state
  const [renewPending, setRenewPending] = useState<string | null>(null);
  const [renewError, setRenewError] = useState<Record<string, string>>({});
  const [confirmFor, setConfirmFor] = useState<StakePosition | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // S3 — bump to force a re-check of localStorage dismissal state.
  const [noticeVersion, setNoticeVersion] = useState(0);

  const load = async () => {
    try {
      // G-7 (docs/specs/deep-core-05-screen-flow-frd.md) — the game surface
      // does not add its own poll; its derived state rides along on this
      // same positions request (getStakePositionsAndGame), not a second one.
      const [p, posAndGame, bal, rew] = await Promise.all([
        getStakingProducts(), getStakePositionsAndGame(), getNiaBalance().catch(() => []),
        getStakingRewards().catch(() => null),
      ]);
      setProducts(p); setPositions(posAndGame.positions); setGameState(posAndGame.game);
      setBalances(aggregateBalances(bal)); setRewards(rew);
    } catch { /* sections show empty state */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // Tick once a second for the live maturity countdown.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Available (free) balance per coin = Nia balance − active staked principal.
  const lockedByCoin = useMemo(() => {
    const m = new Map<string, Decimal>();
    for (const p of positions) if (p.status === 'ACTIVE') m.set(p.coin, (m.get(p.coin) ?? new Decimal(0)).plus(new Decimal(p.principal)));
    return m;
  }, [positions]);
  const availableFor = (coin: string) =>
    Decimal.max(0, (balances.get(coin) ?? new Decimal(0)).minus(lockedByCoin.get(coin) ?? new Decimal(0)));

  const submitStake = async (product: StakingProduct) => {
    setSubmitting(true); setError(null);
    try {
      await stake(product.id, new Decimal(amount).toFixed(), autoRenewChecked);
      setDone(product.id); setAmount(''); setOpenId(null); setAutoRenewChecked(false);
      await load();
      setTimeout(() => setDone(null), 2500);
    } catch (e) { setError((e as Error).message); }
    finally { setSubmitting(false); }
  };

  // S2 — one-tap off. Must succeed regardless of eligibility/maintenanceMode
  // (M-3 / copy spec §2.2) — never gated, never confirmed.
  const handleToggleOff = async (p: StakePosition) => {
    setRenewPending(p.id);
    setRenewError((prev) => { const n = { ...prev }; delete n[p.id]; return n; });
    try {
      const updated = await setAutoRenew(p.id, false);
      setPositions((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...updated } : x)));
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
      setPositions((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...updated } : x)));
      setConfirmFor(null);
    } catch (e) {
      setRenewError((prev) => ({ ...prev, [p.id]: localizeAutoRenewError(e as Error & { code?: string }, ar, p) }));
    } finally {
      setRenewPending(null);
    }
  };

  const handleDismissNotice = (ids: string[]) => {
    dismissRenewalNotices(ids);
    setNoticeVersion((v) => v + 1);
  };

  // §8.2 / copy spec — renewalStatus -> heading + body. `RENEWED` reads the
  // successor position's own term/rate/start (the new term), not the
  // matured position's own snapshot values.
  const outcomeFor = (p: StakePosition): { heading: string; body: string; renewed: boolean; successor?: StakePosition } => {
    if (p.renewalStatus === 'RENEWED') {
      const successor = positions.find((x) => x.id === p.renewedIntoPositionId);
      return {
        heading: ar('renewedHeading'),
        body: ar('renewedCopy', {
          principal: p.principal,
          coin: p.coin,
          productName: p.productName,
          termDays: successor?.termDays ?? p.termDays,
          dailyRatePct: successor?.dailyRatePct ?? p.dailyRatePct,
          startAt: fmtDate(successor?.startAt ?? p.maturityAt),
        }),
        renewed: true,
        successor,
      };
    }
    // Live product lookup (products list is OPEN-only, but FAILED_BELOW_MIN /
    // FAILED_ABOVE_MAX / FAILED_RATE_LOWERED only occur when the product was
    // OPEN at renewal time, so it's usually present). The server does not
    // snapshot the failure-time min/max/rate anywhere, so this is a
    // best-effort current-value approximation — see report to the parent
    // agent for the exact gap.
    const product = products.find((pr) => pr.id === p.productId);
    const base = { productName: p.productName, principal: p.principal, coin: p.coin };
    switch (p.renewalStatus) {
      case 'FAILED_PRODUCT_CLOSED':
        return { heading: ar('notRenewedHeading'), body: ar('notRenewedClosedCopy', base), renewed: false };
      case 'FAILED_TERM_TOO_LONG':
        return { heading: ar('notRenewedHeading'), body: ar('notRenewedTermTooLongCopy', { ...base, maxTermDays: AUTO_RENEW_MAX_TERM_DAYS }), renewed: false };
      case 'FAILED_CAPACITY':
        return { heading: ar('notRenewedHeading'), body: ar('notRenewedCapacityCopy', base), renewed: false };
      case 'FAILED_BELOW_MIN':
        return { heading: ar('notRenewedHeading'), body: ar('notRenewedBelowMinCopy', { ...base, minAmount: product?.minAmount ?? '' }), renewed: false };
      case 'FAILED_ABOVE_MAX':
        return { heading: ar('notRenewedHeading'), body: ar('notRenewedAboveMaxCopy', { ...base, maxAmount: product?.maxAmount ?? '' }), renewed: false };
      case 'FAILED_RATE_LOWERED':
        return { heading: ar('notRenewedHeading'), body: ar('notRenewedRateLoweredCopy', { ...base, dailyRatePct: product?.dailyRatePct ?? p.dailyRatePct, oldRate: p.dailyRatePct }), renewed: false };
      case 'FAILED_TERMS_CHANGED':
        return { heading: ar('notRenewedHeading'), body: ar('notRenewedTermsChangedCopy', base), renewed: false };
      case 'FAILED_SYSTEM':
      case 'FAILED_GRANTED_POSITION':
        return { heading: ar('notRenewedHeading'), body: ar('notRenewedSystemErrorCopy', base), renewed: false };
      default:
        return { heading: '', body: '', renewed: false };
    }
  };

  // S3 — positions with a renewal outcome inside the last 14 days, not yet
  // dismissed. `renewalProcessedAt` is not currently serialized to the
  // client (see report) — `maturityAt` is the closest available proxy,
  // since renewal is decided inside the same transaction as the maturity
  // flip (PRD §6.2), so the two timestamps are effectively the same moment.
  const visibleRenewals = useMemo(() => {
    const cutoff = now - FOURTEEN_DAYS_MS;
    return positions.filter((p) => {
      if (p.renewalStatus === 'NONE' || p.renewalStatus === 'FAILED_ACCOUNT_INACTIVE') return false;
      const processedAt = new Date(p.maturityAt).getTime();
      if (Number.isNaN(processedAt) || processedAt < cutoff) return false;
      return !isRenewalNoticeDismissed(p.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, now, noticeVersion]);

  // S2 — position row auto-renew state (6-row precedence table, copy spec §1.3).
  const renderAutoRenewRow = (p: StakePosition) => {
    if (p.status !== 'ACTIVE') return null;

    // termDays is on the position itself, so "over cap" is exact. The client
    // never receives `grantedByAdminId` (deliberately, per copy spec §1.1) —
    // but since `autoRenewEligible = termDays <= cap && grantedByAdminId ==
    // null`, an ineligible position whose own termDays is within the cap can
    // only be ineligible because of the grant, so this is exact too (not a
    // guess) in every state reachable through the product's own UI. See
    // report for the one-instant edge case (both a grant AND over-cap on the
    // same position) this can't distinguish.
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

    // Rows 2-5 (autoRenew on, in any state) are always one-tap off. Row 6
    // (eligible, off) opens the confirm sheet — the on-ramp only (§2's
    // tie-breaking principle / M-3).
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
    const { heading, body, renewed, successor } = outcomeFor(p);
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

  const STATUS_STYLE: Record<string, string> = {
    ACTIVE: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/25',
    MATURED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
    PAID: 'bg-slate-500/10 text-slate-300 border-slate-500/25',
  };

  return (
    <div className="bana-page flex-1 min-h-full bg-[#06132a] text-[#d8e2ff] p-4 sm:p-6 lg:p-8 flex flex-col gap-6 overflow-y-auto">
      <header className="pb-2 border-b border-[#1E3559]/40">
        <h1 data-testid="staking-title" className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
          <Coins className="h-7 w-7 text-[#528dff]" /> {t('pageTitle')}
        </h1>
        <p className="text-xs sm:text-sm text-[#8c90a0] mt-1 font-mono">{t('pageSubtitle')}</p>
      </header>

      {loading ? (
        <div className="flex items-center gap-2.5 py-10 justify-center"><Loader2 className="h-5 w-5 text-[#528dff] animate-spin" /><span className="text-sm text-[#8c90a0]">{t('loading')}</span></div>
      ) : (
        <>
          {/* DEEP CORE — Phase 0 visual growth layer
              (docs/specs/deep-core-05-screen-flow-frd.md §2.2, G-3/G-10).
              All game logic lives in ./staking/deep-core/; this is the only
              insertion point. The referral/invite surface no longer renders
              anywhere on this page (RT-1 / L1) — it moved to /referral
              (docs/specs/referral-panel-relocation-frd.md). */}
          <DeepCoreEmbed
            game={gameState}
            loading={loading}
            onWellClick={(positionId) => document.getElementById(`position-${positionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          />

          {/* Rewards earned — real amounts credited by the daily payout worker */}
          {rewards && Object.entries(rewards.totalByCoin).some(([, a]) => new Decimal(a || '0').gt(0)) && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-[#d8e2ff] flex items-center gap-2"><Coins className="h-4 w-4 text-emerald-400" /> Rewards Earned</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Object.entries(rewards.totalByCoin)
                  .filter(([, a]) => new Decimal(a || '0').gt(0))
                  .map(([coin, amt]) => (
                    <div key={coin} data-testid="rewards-earned" className="p-4 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex items-center gap-3">
                      <CoinAvatar symbol={coin} size={30} />
                      <div className="min-w-0">
                        <div className="text-emerald-400 font-mono font-bold truncate">+{new Decimal(amt).toSignificantDigits(8).toString()} {coin}</div>
                        <div className="text-[10px] font-mono text-[#8c90a0] uppercase tracking-wide">Paid to date</div>
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          )}

          {/* Earn — available products */}
          <section id="staking-earn-section" className="flex flex-col gap-3 scroll-mt-4">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-[#d8e2ff] flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-400" /> {t('earnTitle')}</h2>
            {products.length === 0 ? (
              <div className="p-6 rounded-2xl bg-[#112643]/70 border border-[#1E3559] text-center text-sm text-[#8c90a0]">{t('noProducts')}</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {products.map((p) => {
                  const avail = availableFor(p.coin);
                  const isOpen = openId === p.id;
                  const amtDec = (() => { try { return new Decimal(amount || 0); } catch { return new Decimal(0); } })();
                  return (
                    <div key={p.id} className="p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <CoinAvatar symbol={p.coin} size={36} />
                          <div className="min-w-0">
                            <div className="font-bold text-white truncate">{p.name}</div>
                            <div className="text-[11px] font-mono text-[#8c90a0]">{p.coin}</div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-2xl font-extrabold text-emerald-400 leading-none">{p.aprPct}%</div>
                          <div className="text-[10px] font-mono text-[#8c90a0] uppercase tracking-wide mt-0.5">{t('apr')}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                        <div className="flex flex-col"><span className="text-[#8c90a0]">{t('term')}</span><span className="text-white font-bold">{t('daysN', { n: p.termDays })}</span></div>
                        <div className="flex flex-col"><span className="text-[#8c90a0]">{t('dailyRate')}</span><span className="text-white font-bold">{p.dailyRatePct}%</span></div>
                        {(p.minAmount || p.maxAmount) && (
                          <div className="flex flex-col col-span-2"><span className="text-[#8c90a0]">{t('limits')}</span>
                            <span className="text-white">{p.minAmount ? `${t('min')} ${p.minAmount}` : ''}{p.minAmount && p.maxAmount ? ' · ' : ''}{p.maxAmount ? `${t('max')} ${p.maxAmount}` : ''} {p.coin}</span>
                          </div>
                        )}
                      </div>

                      {done === p.id ? (
                        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-sm font-bold"><Check className="h-4 w-4" /> {t('stakeSuccess')}</div>
                      ) : isOpen ? (
                        <div className="flex flex-col gap-2 pt-1 border-t border-[#1E3559]/50">
                          <div className="flex justify-between text-[11px] font-mono text-[#8c90a0]">
                            <span>{t('amount')}</span>
                            <span>{t('available')}: {avail.toSignificantDigits(8).toString()} {p.coin}</span>
                          </div>
                          <div className="flex items-center gap-2 p-3 rounded-xl bg-[#020d24]/70 border border-[#1E3559]">
                            <input value={amount} onChange={(e) => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v); }} placeholder="0.00" inputMode="decimal"
                              className="bg-transparent text-lg font-bold font-mono text-white focus:outline-none w-full min-w-0" />
                            <button onClick={() => setAmount(avail.toFixed())} className="px-2 py-1 bg-[#112643] hover:bg-[#1e3459] border border-[#1E3559] text-[#528dff] rounded text-[10px] font-bold cursor-pointer shrink-0">{t('max')}</button>
                            <span className="font-mono text-sm text-[#afc6ff] font-bold shrink-0">{p.coin}</span>
                          </div>
                          {error && <span className="text-[11px] text-rose-400 font-mono">{error}</span>}
                          {amtDec.gt(0) && (
                            <p className="text-[11px] font-mono text-[#8c90a0]">{t('earnPreview', { interest: amtDec.times(new Decimal(p.dailyRatePct).div(100)).times(p.termDays).toSignificantDigits(8).toString(), coin: p.coin, days: p.termDays })}</p>
                          )}
                          {/* S1 — auto-renew opt-in rider. Hidden entirely (not
                              disabled) above the 90-day cap, per copy spec §1.2:
                              silence, no explanatory text. Never affects the
                              button below (label/style/prominence/preview). */}
                          {p.termDays <= AUTO_RENEW_MAX_TERM_DAYS && (
                            <label className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-[#020d24]/50 border border-[#1E3559]/70 cursor-pointer">
                              <input
                                type="checkbox"
                                data-testid="autorenew-optin"
                                checked={autoRenewChecked}
                                onChange={(e) => setAutoRenewChecked(e.target.checked)}
                                className="mt-0.5 h-4 w-4 shrink-0 accent-[#528dff] cursor-pointer"
                              />
                              <span className="flex flex-col gap-0.5">
                                <span className="text-xs font-bold text-white">{ar('optInLabel')}</span>
                                <span className="text-[11px] font-mono text-[#8c90a0] leading-relaxed">{ar('optInHelp', { termDays: p.termDays })}</span>
                              </span>
                            </label>
                          )}
                          <div className="flex gap-2">
                            <button disabled={submitting || amtDec.lte(0) || amtDec.gt(avail)} onClick={() => submitStake(p)}
                              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-sm border border-emerald-400/40 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
                              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} {t('confirmStake')}
                            </button>
                            <button disabled={submitting} onClick={() => { setOpenId(null); setError(null); setAmount(''); setAutoRenewChecked(false); }} className="px-4 py-2.5 rounded-xl bg-[#020d24]/60 hover:bg-[#112643] text-[#8c90a0] hover:text-white text-sm font-bold border border-[#1E3559]/80 cursor-pointer">{t('cancel')}</button>
                          </div>
                        </div>
                      ) : (
                        <button disabled={p.full} onClick={() => { setOpenId(p.id); setError(null); setAmount(''); setAutoRenewChecked(false); }}
                          className="w-full py-2.5 rounded-xl bg-[#2E7DFF]/10 hover:bg-[#2E7DFF]/20 border border-[#528dff]/40 text-[#afc6ff] hover:text-white font-bold text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                          {p.full ? t('full') : t('stakeBtn')}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* My Stakes */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-[#d8e2ff] flex items-center gap-2"><Lock className="h-4 w-4 text-[#528dff]" /> {t('myStakesTitle')}</h2>

            {/* S3 — dismissible renewal outcome notice. Same neutral weight
                for success and failure (PRD §4 S3) — no celebratory or
                error styling either way. Collapses to one card with a count
                badge when several positions renewed in the same cycle. */}
            {visibleRenewals.length > 0 && (
              <div data-testid="renewal-notice" className="p-4 rounded-2xl bg-[#112643]/50 border border-[#1E3559] flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Info className="h-4 w-4 text-[#8c90a0] shrink-0" />
                    {visibleRenewals.length > 1 && (
                      <span data-testid="renewal-notice-count" className="inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full text-[10px] font-bold bg-[#1E3559] text-[#afc6ff] border border-[#528dff]/30">
                        {visibleRenewals.length}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    data-testid="renewal-notice-dismiss"
                    onClick={() => handleDismissNotice(visibleRenewals.map((p) => p.id))}
                    className="text-[#8c90a0] hover:text-white cursor-pointer shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-col gap-2 divide-y divide-[#1E3559]/40">
                  {visibleRenewals.map((p) => {
                    const { heading, body } = outcomeFor(p);
                    return (
                      <div key={p.id} className="pt-2 first:pt-0 flex flex-col gap-0.5">
                        <span className="text-[11px] font-bold text-[#d8e2ff]">{heading}</span>
                        <span className="text-[11px] font-mono text-[#8c90a0] leading-relaxed">{body}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {positions.length === 0 ? (
              <div className="p-6 rounded-2xl bg-[#112643]/70 border border-[#1E3559] text-center text-sm text-[#8c90a0]">{t('noStakes')}</div>
            ) : (
              <div className="flex flex-col gap-3">
                {positions.map((p) => {
                  const liveAccrued = accruedInterest(p.principal, p.dailyRatePct, p.startAt, p.termDays, new Date(now)).toSignificantDigits(8).toString();
                  const elapsed = daysElapsed(p.startAt, new Date(now), p.termDays);
                  const remainingMs = msToMaturity(p.maturityAt, new Date(now));
                  // DEEP CORE — the one badge added to each row (05 §2.6 / G-10).
                  // Only positions the game surface is actually rendering as a well
                  // (active, or matured < 24h ago) get one.
                  const wellIdx = gameState?.wells.findIndex((w) => w.positionId === p.id) ?? -1;
                  return (
                    <div key={p.id} data-testid="staking-position" id={`position-${p.id}`} className="p-4 sm:p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-1">
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
                                  onClick={() => document.getElementById('deep-core-canvas-box')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                                />
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-[#8c90a0]">{t('dayOf', { d: elapsed, total: p.termDays })} · {p.aprPct}% {t('apr')}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-5 shrink-0">
                          <div className="text-right">
                            <div data-testid="position-accrued" className="text-sm font-bold text-emerald-400 font-mono">+{liveAccrued}</div>
                            <div className="text-[10px] font-mono text-[#8c90a0] uppercase tracking-wide">{t('accrued')}</div>
                          </div>
                          <div className="text-right min-w-[92px]">
                            <div className="text-xs font-mono text-[#d8e2ff] flex items-center gap-1 justify-end"><Clock className="h-3 w-3 text-[#8c90a0]" /> {p.status === 'ACTIVE' ? fmtCountdown(remainingMs) : '—'}</div>
                            <span className={`inline-block mt-1 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[p.status]}`}>{t(`status${p.status}` as 'statusACTIVE')}</span>
                          </div>
                        </div>
                      </div>
                      {renderAutoRenewRow(p)}
                      {renderMaturedOutcome(p)}
                    </div>
                  );
                })}
                <p className="text-[11px] font-mono text-[#8c90a0] px-1">{t('maturedNote')}</p>
              </div>
            )}
          </section>
        </>
      )}

      {/* S2 — confirm sheet, shown only when turning auto-renew ON. The lock
          line (confirmLock) is verbatim, bold, and inline — never a tooltip,
          never softened (copy spec §0.3 / PRD §4). */}
      {confirmFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
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
        <div data-testid="autorenew-toast" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-[#112643] border border-[#1E3559] text-xs font-mono text-[#d8e2ff] shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
