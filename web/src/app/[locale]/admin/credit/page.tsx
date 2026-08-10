'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import Decimal from 'decimal.js';
import {
  ArrowLeft, AlertTriangle, Landmark, Loader2, Plus, Minus, RefreshCw, Info,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import {
  getAdminCreditContext, getAdminCreditTarget, submitAdminCredit, AdminCreditApiError,
  ADMIN_ADJUSTMENT_REASON_TYPES,
  type AdminCreditContext, type AdminCreditLimitRow, type AdminCreditTarget,
  type AdminCreditSubmitResult, type AdminAdjustmentDirection, type AdminAdjustmentReasonType,
  type SolvencyIncident,
} from '@/utils/adminApi';
import { SolvencyIncidentBanner } from '@/components/admin/reserve/SolvencyIncidentBanner';

// docs/specs/staking-yield-system-v2-design-t16-admin-credit-frd.md
// §3 — 7-state machine, §4 — layout/flow, §5/§6 — client-side hints only (the
// server, /api/admin/credit + /context + /target, is the sole authority — this
// file never re-implements adminCredit.ts's gate/limit logic, only mirrors the
// user-facing shape of a few cheap, non-security checks for inline UX hints).
//
// CLAUDE.md rule 2 — every amount here is decimal.js. No Number()/parseFloat().

type ScreenState = 'LOADING' | 'LOAD_FAILED' | 'DISABLED' | 'NO_LOCAL_COIN' | 'LIMITS_UNSET' | 'CAP_EXHAUSTED' | 'READY';

const REASON_LABEL_KEY: Record<AdminAdjustmentReasonType, string> = {
  E2E_VERIFICATION: 'reasonE2E',
  RECONCILIATION_FIX: 'reasonRecon',
  INCIDENT_COMPENSATION: 'reasonIncident',
  OTHER: 'reasonOther',
};

const KNOWN_ERROR_CODES = new Set([
  'ADMIN_CREDIT_DISABLED',
  'ADMIN_CREDIT_LIMIT_PER_TX',
  'ADMIN_CREDIT_LIMIT_PER_DAY',
  'ADMIN_CREDIT_CUMULATIVE_CAP',
  'ADMIN_CREDIT_CONFIRMATION_MISMATCH',
  'ADMIN_ADJUSTMENT_DEBIT_EXCEEDS_AVAILABLE',
  'ADMIN_CREDIT_USER_NOT_FOUND',
  'ADMIN_CREDIT_COIN_NOT_LOCAL',
  // rev05a AC-16/AC-T16-23 — CREDIT on a T2_HALTED coin is restricted to
  // reasonType=RECONCILIATION_FIX at the route layer; this is the rejection
  // code for the other 3 reason types. DEBIT is never restricted.
  'ADMIN_CREDIT_T2_REASON_RESTRICTED',
]);

// §4.3 — trim + collapse internal whitespace, count in codepoints (never UTF-16
// units, which under/over-count CJK and emoji). Mirrors adminCredit.ts's rule for
// UX purposes only — the server re-measures and is the final judge (AC-4/V5).
function normalizeDescription(raw: string): { normalized: string; length: number } {
  const normalized = raw.trim().replace(/\s+/g, ' ');
  return { normalized, length: Array.from(normalized).length };
}
function minDescriptionCodepoints(reasonType: AdminAdjustmentReasonType | ''): number {
  return reasonType === 'OTHER' ? 20 : 4;
}

function isExhausted(row: AdminCreditLimitRow | undefined): boolean {
  if (!row || row.remaining == null) return false;
  try {
    return new Decimal(row.remaining).lte(0);
  } catch {
    return false;
  }
}

function ErrorMessage({
  code, message, detail, coin, t,
}: {
  code: string; message: string; detail: Record<string, unknown> | null; coin: string | null;
  t: ReturnType<typeof useTranslations>;
}) {
  if (!KNOWN_ERROR_CODES.has(code)) {
    return <>{t('errors.UNKNOWN', { code })}</>;
  }
  return (
    <>
      {t(`errors.${code}` as 'errors.ADMIN_CREDIT_DISABLED', {
        coin: coin ?? '',
        limit: (detail?.limit as string | undefined) ?? '',
        balance: (detail?.balance as string | undefined) ?? '',
        held: (detail?.held as string | undefined) ?? '',
        available: (detail?.available as string | undefined) ?? '',
      })}
    </>
  );
}

export default function AdminCreditPage() {
  const t = useTranslations('adminCredit');
  const nav = useTranslations('nav');

  const [ctxLoading, setCtxLoading] = useState(true);
  const [ctx, setCtx] = useState<AdminCreditContext | null>(null);
  const [coin, setCoin] = useState<string | null>(null);

  const refreshLimits = useCallback(async (c: string | null) => {
    try {
      const data = await getAdminCreditContext(c);
      setCtx(data);
    } catch {
      setCtx({ enabled: null, coins: null, limits: null, state: 'error' });
    }
  }, []);

  // Initial load — discover coins first, then fetch coin-scoped limits (§5 DC-1).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCtxLoading(true);
      try {
        const first = await getAdminCreditContext();
        if (cancelled) return;
        if (first.state === 'error' || !first.coins) {
          setCtx(first);
          setCoin(null);
          return;
        }
        const defaultCoin = first.coins.length > 0 ? first.coins[0].symbol : null;
        setCoin(defaultCoin);
        if (defaultCoin) {
          const withLimits = await getAdminCreditContext(defaultCoin);
          if (!cancelled) setCtx(withLimits);
        } else {
          setCtx(first);
        }
      } catch {
        if (!cancelled) setCtx({ enabled: null, coins: null, limits: null, state: 'error' });
      } finally {
        if (!cancelled) setCtxLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selectCoin = (symbol: string) => {
    setCoin(symbol);
    setTarget(null);
    refreshLimits(symbol);
  };

  // §3.1 — priority top-to-bottom; the first matching state wins.
  const screenState: ScreenState = useMemo(() => {
    if (ctxLoading || !ctx) return 'LOADING';
    if (ctx.state === 'error' || ctx.enabled == null || ctx.coins == null || ctx.limits == null) return 'LOAD_FAILED';
    if (ctx.enabled === false) return 'DISABLED';
    if (ctx.coins.length === 0) return 'NO_LOCAL_COIN';
    if (ctx.limits.some((l) => l.limit == null)) return 'LIMITS_UNSET';
    const perDay = ctx.limits.find((l) => l.key === 'perDay');
    const cumulative = ctx.limits.find((l) => l.key === 'cumulative');
    if (isExhausted(perDay) || isExhausted(cumulative)) return 'CAP_EXHAUSTED';
    return 'READY';
  }, [ctxLoading, ctx]);

  const showForm = screenState === 'READY' || screenState === 'CAP_EXHAUSTED';
  const formReadOnly = screenState === 'CAP_EXHAUSTED';
  const showLimits = screenState === 'LIMITS_UNSET' || screenState === 'CAP_EXHAUSTED' || screenState === 'READY';

  const selectedCoinOption = ctx?.coins?.find((c) => c.symbol === coin) ?? null;
  // §3.3 — READY only. T2 doesn't block this surface, it's disclosed alongside it.
  const t2Incidents: SolvencyIncident[] =
    screenState === 'READY' && coin && selectedCoinOption?.authorityAlertStage === 'T2_HALTED'
      ? [{ code: 'AUTHORITY_T2', coin }]
      : [];

  // ---- Form state ----
  const [direction, setDirection] = useState<AdminAdjustmentDirection>('CREDIT');
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [amountTouched, setAmountTouched] = useState(false);
  const [reasonType, setReasonType] = useState<AdminAdjustmentReasonType | ''>('');
  const [description, setDescription] = useState('');
  const [descriptionTouched, setDescriptionTouched] = useState(false);

  const onAmountChange = (raw: string) => {
    // V2 — normalize thousands separators/spaces immediately; never a float.
    const cleaned = raw.replace(/[,\s]/g, '');
    if (cleaned === '' || /^\d*\.?\d*$/.test(cleaned)) setAmount(cleaned);
  };

  const amountDecimal = useMemo(() => {
    if (amount.trim() === '') return null;
    try {
      const d = new Decimal(amount);
      return d.isFinite() && d.gt(0) ? d : null;
    } catch {
      return null;
    }
  }, [amount]);

  const { normalized: normalizedDescription, length: descriptionLength } = normalizeDescription(description);
  const minDescLen = minDescriptionCodepoints(reasonType);
  const descriptionValid = reasonType !== '' && descriptionLength >= minDescLen;
  const emailValid = email.trim().includes('@');

  // rev05a AC-16/AC-T16-23 — T2_HALTED restricts CREDIT to RECONCILIATION_FIX
  // only (route-enforced; this is guidance, not the control — AC-16 explicit).
  // DEBIT and T1_WARNING are never restricted.
  const t2ReasonRestricted = direction === 'CREDIT' && selectedCoinOption?.authorityAlertStage === 'T2_HALTED';

  // If the coin/direction combination becomes restricted while a now-disallowed
  // reason is selected (e.g. switching FROM debit, or the coin flipping to T2
  // mid-session), force an explicit reselect rather than silently submitting a
  // value the route will reject — matches "기본 선택 없음" (no default reason).
  useEffect(() => {
    if (t2ReasonRestricted && reasonType !== '' && reasonType !== 'RECONCILIATION_FIX') {
      setReasonType('');
    }
  }, [t2ReasonRestricted, reasonType]);

  const perTxRow = ctx?.limits?.find((l) => l.key === 'perTx');
  const perTxExceeded = !!(amountDecimal && perTxRow?.limit != null && amountDecimal.gt(new Decimal(perTxRow.limit)));

  // ---- Target preview (§4.4) ----
  const [target, setTarget] = useState<AdminCreditTarget | null>(null);
  const [targetLoading, setTargetLoading] = useState(false);

  useEffect(() => {
    if (!showForm || !coin || !emailValid) {
      setTarget(null);
      return;
    }
    let cancelled = false;
    setTargetLoading(true);
    const trimmed = email.trim();
    const timer = setTimeout(async () => {
      try {
        const data = await getAdminCreditTarget(trimmed, coin);
        if (!cancelled) setTarget(data);
      } catch {
        if (!cancelled) {
          setTarget({
            found: null, userId: null, email: trimmed, balance: null, held: null,
            available: null, adminAdjustmentNet: null, state: 'error',
          });
        }
      } finally {
        if (!cancelled) setTargetLoading(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, coin, showForm]);

  const debitExceedsAvailable =
    direction === 'DEBIT' && !!amountDecimal && target?.found === true && target.available != null
      && amountDecimal.gt(new Decimal(target.available));

  const canReview =
    showForm && !formReadOnly && emailValid && !!amountDecimal && !!reasonType && descriptionValid
    && !perTxExceeded && !debitExceedsAvailable && !!coin;

  // ---- Confirm modal (§4.6) ----
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [confirmAmount, setConfirmAmount] = useState('');
  const [confirmEmailTouched, setConfirmEmailTouched] = useState(false);
  const [confirmAmountTouched, setConfirmAmountTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<{ code: string; message: string; detail: Record<string, unknown> | null } | null>(null);
  const [result, setResult] = useState<AdminCreditSubmitResult | null>(null);

  const openConfirm = () => {
    if (!canReview) return;
    // J-5/DC-6 — the idempotency key is minted once, at modal-open time. A
    // retry inside the SAME open modal reuses it; closing and reopening mints
    // a new one.
    setIdempotencyKey(crypto.randomUUID());
    setConfirmEmail('');
    setConfirmAmount('');
    setConfirmEmailTouched(false);
    setConfirmAmountTouched(false);
    setSubmitError(null);
    setConfirmOpen(true);
  };
  const closeConfirm = () => {
    if (submitting) return;
    setConfirmOpen(false);
    setIdempotencyKey(null);
  };

  const confirmEmailMatches = email.trim() !== '' && confirmEmail.trim().toLowerCase() === email.trim().toLowerCase();
  const confirmAmountMatches = useMemo(() => {
    if (!amountDecimal) return false;
    try {
      return new Decimal(confirmAmount).eq(amountDecimal);
    } catch {
      return false;
    }
  }, [confirmAmount, amountDecimal]);

  const doSubmit = async () => {
    if (!coin || !amountDecimal || !reasonType || !idempotencyKey) return;
    if (!confirmEmailMatches || !confirmAmountMatches) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await submitAdminCredit({
        direction,
        email: email.trim(),
        coin,
        amount: amountDecimal.toFixed(),
        reasonType,
        description: normalizedDescription,
        confirmEmail,
        confirmAmount,
        idempotencyKey,
      });
      setResult(res);
      setConfirmOpen(false);
    } catch (e) {
      const err = e as AdminCreditApiError;
      setSubmitError({ code: err.code ?? 'UNKNOWN', message: err.message, detail: err.detail ?? null });
    } finally {
      setSubmitting(false);
    }
  };

  const resetAfterResult = () => {
    setResult(null);
    setEmail('');
    setAmount('');
    setAmountTouched(false);
    setReasonType('');
    setDescription('');
    setDescriptionTouched(false);
    setTarget(null);
    if (coin) refreshLimits(coin);
  };

  const statusChip: { key: string; className: string } | null = (() => {
    switch (screenState) {
      case 'DISABLED': return { key: 'statusDisabled', className: 'bg-slate-500/10 text-slate-300 border-slate-500/25' };
      case 'LIMITS_UNSET': return { key: 'statusUnconfigured', className: 'bg-amber-500/10 text-amber-300 border-amber-500/25' };
      case 'CAP_EXHAUSTED': return { key: 'statusCapReached', className: 'bg-amber-500/10 text-amber-300 border-amber-500/25' };
      case 'READY': return { key: 'statusReady', className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25' };
      default: return null;
    }
  })();

  const inputCls = 'w-full px-3 py-2.5 rounded-xl bg-[#020d24]/60 border border-[#1E3559] text-sm font-mono text-[#d8e2ff] placeholder-[#8c90a0] focus:outline-none focus:border-[#528dff]/60 transition-colors disabled:opacity-50';

  return (
    <div className="flex-1 min-h-full bg-[#06132a] text-[#d8e2ff] p-4 sm:p-6 lg:p-8 flex flex-col gap-6 overflow-y-auto">
      <Link
        href="/admin/settings"
        className="self-start flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#112643]/70 border border-[#1E3559] text-[#afc6ff] hover:text-white hover:bg-[#1e3459] text-sm font-bold transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> {nav('settings')}
      </Link>

      <header className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center pb-2 border-b border-[#1E3559]/40">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <Landmark className="h-7 w-7 text-[#528dff]" />
            {t('pageTitle')}
            {statusChip && (
              <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full border ${statusChip.className}`}>
                {t(statusChip.key as 'statusReady')}
              </span>
            )}
          </h1>
          <p className="text-xs sm:text-sm text-[#8c90a0] mt-1 font-mono">{t('pageSubtitle')}</p>
        </div>
        <button
          onClick={() => { setCtxLoading(true); refreshLimits(coin).finally(() => setCtxLoading(false)); }}
          aria-label="Refresh"
          className="self-start p-2 rounded-lg border border-[#1E3559] bg-[#020d24]/60 hover:bg-[#1e3459] text-[#8c90a0] hover:text-white transition-colors cursor-pointer"
        >
          <RefreshCw className={`h-4 w-4 ${ctxLoading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* ③ AC-2 — always rendered, every state, no dismiss/collapse control. */}
      <div role="alert" className="flex flex-col gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3.5 text-amber-100">
        <p className="text-xs font-bold uppercase tracking-wide text-amber-300 flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4" /> {t('warnTitle')}
        </p>
        <p className="flex items-start gap-2 text-xs leading-relaxed"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {t('warnPor')}</p>
        <p className="flex items-start gap-2 text-xs leading-relaxed"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {t('warnLiability')}</p>
        <p className="flex items-start gap-2 text-xs leading-relaxed"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {t('warnNotWithdrawal')}</p>
      </div>

      {/* ③' T2 — same banner component the withdrawal queue uses (§3.3). */}
      <SolvencyIncidentBanner incidents={t2Incidents} />

      {screenState === 'LOADING' && (
        <div className="flex flex-col gap-3">
          <div className="h-20 rounded-xl bg-[#112643]/40 animate-pulse" />
          <div className="h-40 rounded-xl bg-[#112643]/40 animate-pulse" />
        </div>
      )}

      {screenState === 'LOAD_FAILED' && (
        <div className="px-4 py-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-200 text-sm leading-relaxed">
          {t('loadFailed')}
        </div>
      )}

      {screenState === 'DISABLED' && (
        <div className="max-w-xl flex flex-col gap-2 px-4 py-4 rounded-xl bg-[#112643]/70 border border-[#1E3559]">
          <h2 className="text-sm font-bold text-white">{t('disabledTitle')}</h2>
          <p className="text-xs text-[#8c90a0] leading-relaxed">{t('disabledBody')}</p>
          <p className="text-xs text-[#8c90a0] leading-relaxed">{t('disabledWhere')}</p>
        </div>
      )}

      {screenState === 'NO_LOCAL_COIN' && (
        <div className="max-w-xl px-4 py-4 rounded-xl bg-[#112643]/70 border border-[#1E3559] text-sm text-[#8c90a0] leading-relaxed">
          {t('unavailableNoCoin')}
        </div>
      )}

      {screenState === 'LIMITS_UNSET' && (
        <div className="max-w-xl flex flex-col gap-2 px-4 py-4 rounded-xl bg-[#112643]/70 border border-amber-500/30">
          <h2 className="text-sm font-bold text-amber-300">{t('unconfiguredTitle')}</h2>
          <p className="text-xs text-[#8c90a0] leading-relaxed">{t('unconfiguredBody')}</p>
        </div>
      )}

      {showLimits && ctx?.limits && (
        <section className="rounded-2xl bg-[#112643]/70 border border-[#1E3559] p-4 sm:p-5 flex flex-col gap-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-[#8c90a0]">{t('limitsTitle')}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] font-mono uppercase tracking-wider text-[#8c90a0] border-b border-[#1E3559]">
                  <th className="py-2 pr-3 font-semibold">—</th>
                  <th className="py-2 pr-3 font-semibold text-right" />{/* per-row label already names the limit ("Not set" / "{limit} {coin}") */}
                  <th className="py-2 pr-3 font-semibold text-right">{t('limitUsed')}</th>
                  <th className="py-2 pr-3 font-semibold text-right">{t('limitRemaining')}</th>
                </tr>
              </thead>
              <tbody>
                {ctx.limits.map((row) => {
                  const isPerTx = row.key === 'perTx';
                  const unset = row.limit == null;
                  const exhausted = !isPerTx && isExhausted(row);
                  const labelKey = row.key === 'perTx' ? 'limitPerTx' : row.key === 'perDay' ? 'limitPerDay' : 'limitCumulative';
                  const scopeKey = row.key === 'perTx' ? 'scopePerTx' : row.key === 'perDay' ? 'scopePerDay' : 'scopeCumulative';
                  let usedDisplay: string;
                  let remainingDisplay: string;
                  if (isPerTx) {
                    usedDisplay = '—';
                    remainingDisplay = '—';
                  } else if (unset) {
                    usedDisplay = row.used == null ? '—' : `${row.used} ${coin ?? ''}`;
                    remainingDisplay = t('limitUnset');
                  } else if (row.used == null) {
                    usedDisplay = t('limitError');
                    remainingDisplay = t('limitError');
                  } else {
                    usedDisplay = `${row.used} ${coin ?? ''}`;
                    remainingDisplay = row.remaining != null ? `${row.remaining} ${coin ?? ''}` : t('limitError');
                  }
                  return (
                    <tr key={row.key} className={`border-b border-[#1E3559]/40 last:border-0 ${unset || exhausted ? 'bg-amber-500/5' : ''}`}>
                      <td className="py-2 pr-3">
                        <div className="font-bold text-white">{t(labelKey as 'limitPerTx')}</div>
                        <div className="text-[10px] text-[#8c90a0]">{t(scopeKey as 'scopePerTx')}</div>
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">
                        {unset ? <span className="text-amber-300 font-bold">{t('limitUnset')}</span> : <span className="text-white">{row.limit} {coin}</span>}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono text-[#d8e2ff]">{usedDisplay}</td>
                      <td className={`py-2 pr-3 text-right font-mono ${exhausted ? 'text-amber-300 font-bold' : 'text-[#d8e2ff]'}`}>{remainingDisplay}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="flex items-start gap-1.5 text-[11px] text-[#8c90a0] leading-relaxed">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {t('limitRollingNote')}
          </p>
        </section>
      )}

      {!result && showForm && coin && (
        <section className="max-w-2xl flex flex-col gap-5">
          {/* Scope notice — AC-1 */}
          <div className="p-4 rounded-xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-1.5">
            <h3 className="text-xs font-bold uppercase tracking-wide text-[#8c90a0]">{t('scopeTitle')}</h3>
            <p className="text-xs text-[#8c90a0] leading-relaxed">{t('scopeBody')}</p>
          </div>

          {/* Direction */}
          <div className="flex flex-col gap-2">
            <div className="inline-flex rounded-xl border border-[#1E3559] overflow-hidden w-fit">
              <button
                type="button"
                disabled={formReadOnly}
                onClick={() => setDirection('CREDIT')}
                className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-50 ${direction === 'CREDIT' ? 'bg-indigo-600 text-white' : 'bg-[#020d24]/60 text-[#8c90a0] hover:text-white'}`}
              >
                <Plus className="h-4 w-4" /> {t('modeCredit')}
              </button>
              <button
                type="button"
                disabled={formReadOnly}
                onClick={() => setDirection('DEBIT')}
                className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-50 ${direction === 'DEBIT' ? 'bg-amber-600 text-white' : 'bg-[#020d24]/60 text-[#8c90a0] hover:text-white'}`}
              >
                <Minus className="h-4 w-4" /> {t('modeDebit')}
              </button>
            </div>
            {direction === 'DEBIT' && <p className="text-xs text-[#8c90a0] leading-relaxed">{t('modeDebitHint')}</p>}
          </div>

          {/* Target email */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-[#afc6ff]">{t('fieldEmail')}</label>
            <input
              value={email}
              disabled={formReadOnly}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('fieldEmailPlaceholder')}
              className={inputCls}
            />
          </div>

          {/* Coin — §6-V7: single option renders as a read-only chip, never a hardcoded symbol */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-[#afc6ff]">{t('fieldCoin')}</label>
            {ctx?.coins && ctx.coins.length > 1 ? (
              <select
                value={coin}
                disabled={formReadOnly}
                onChange={(e) => selectCoin(e.target.value)}
                className={inputCls}
              >
                {ctx.coins.map((c) => (
                  <option key={c.symbol} value={c.symbol}>{c.symbol}</option>
                ))}
              </select>
            ) : (
              <span className="inline-flex w-fit items-center px-3.5 py-2.5 rounded-xl bg-[#020d24]/60 border border-[#1E3559] font-mono text-sm text-white">{coin}</span>
            )}
          </div>

          {/* Amount */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-[#afc6ff]">{t('fieldAmount')}</label>
            <input
              value={amount}
              disabled={formReadOnly}
              onChange={(e) => onAmountChange(e.target.value)}
              onBlur={() => setAmountTouched(true)}
              placeholder={t('fieldAmountPlaceholder')}
              inputMode="decimal"
              className={inputCls}
            />
            {amountTouched && amount !== '' && !amountDecimal && (
              <p className="text-[11px] text-rose-300">{t('amountInvalid')}</p>
            )}
            {perTxExceeded && perTxRow?.limit != null && (
              <p className="text-[11px] text-amber-300 leading-relaxed">
                <ErrorMessage code="ADMIN_CREDIT_LIMIT_PER_TX" message="" detail={{ limit: perTxRow.limit }} coin={coin} t={t} />
              </p>
            )}
            {debitExceedsAvailable && target?.found === true && (
              <p className="text-[11px] text-rose-300 leading-relaxed">
                <ErrorMessage
                  code="ADMIN_ADJUSTMENT_DEBIT_EXCEEDS_AVAILABLE"
                  message=""
                  detail={{ balance: target.balance, held: target.held, available: target.available }}
                  coin={coin}
                  t={t}
                />
              </p>
            )}
          </div>

          {/* Reason type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-[#afc6ff]">{t('fieldReason')}</label>
            <select
              value={reasonType}
              disabled={formReadOnly}
              onChange={(e) => setReasonType(e.target.value as AdminAdjustmentReasonType)}
              className={inputCls}
            >
              <option value="" disabled>{t('reasonSelect')}</option>
              {ADMIN_ADJUSTMENT_REASON_TYPES.map((rt) => {
                // rev05a AC-16/AC-T16-23 — disabled, never removed, so the admin
                // learns the option exists but is blocked right now (not "never
                // available"). The route is the actual control (AC-16 explicit).
                const disabledByT2 = t2ReasonRestricted && rt !== 'RECONCILIATION_FIX';
                return (
                  <option key={rt} value={rt} disabled={formReadOnly || disabledByT2}>
                    {t(REASON_LABEL_KEY[rt] as 'reasonE2E')}
                  </option>
                );
              })}
            </select>
            {t2ReasonRestricted && (
              <p className="text-[11px] text-amber-300 leading-relaxed">{t('reasonT2Restricted')}</p>
            )}
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-[#afc6ff]">{t('fieldDescription')}</label>
            <textarea
              value={description}
              disabled={formReadOnly}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => setDescriptionTouched(true)}
              placeholder={t('descriptionPlaceholder')}
              rows={3}
              className={inputCls}
            />
            {descriptionTouched && reasonType !== '' && description.trim() === '' && (
              <p className="text-[11px] text-rose-300">{t('descriptionRequired')}</p>
            )}
            {descriptionTouched && description.trim() !== '' && !descriptionValid && (
              <p className="text-[11px] text-rose-300">{t('descriptionTooShort', { min: minDescLen })}</p>
            )}
          </div>

          {/* Target preview — §4.4 */}
          {emailValid && (
            <div className="rounded-xl bg-[#020d24]/40 border border-[#1E3559] p-4 flex flex-col gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[#8c90a0]">{t('targetTitle')}</h3>
              {targetLoading ? (
                <p className="text-xs font-mono text-[#8c90a0]">{t('targetLoading')}</p>
              ) : !target ? null : target.state === 'error' ? (
                <p className="text-xs text-rose-300">{t('targetError')}</p>
              ) : target.found === false ? (
                <p className="text-xs text-rose-300">{t('targetNotFound')}</p>
              ) : target.found === true ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
                    <div>
                      <div className="text-[#8c90a0]">{t('targetBalance')}</div>
                      <div className="text-white font-bold">{target.balance} {coin}</div>
                    </div>
                    <div>
                      <div className="text-[#8c90a0]">{t('targetHeld')}</div>
                      <div className="text-[#d8e2ff]">{target.held} {coin}</div>
                    </div>
                    <div>
                      <div className="text-[#8c90a0]">{t('targetAvailable')}</div>
                      <div className={direction === 'DEBIT' ? 'text-amber-300 font-bold' : 'text-[#d8e2ff]'}>{target.available} {coin}</div>
                    </div>
                    <div>
                      <div className="text-[#8c90a0]">{t('targetAdminNet')}</div>
                      <div className="text-violet-300">{target.adminAdjustmentNet} {coin}</div>
                    </div>
                  </div>
                  {target.held != null && new Decimal(target.held).gt(0) && (
                    <p className="text-[11px] text-[#8c90a0] leading-relaxed">{t('targetHint')}</p>
                  )}
                </>
              ) : null}
            </div>
          )}

          {!formReadOnly && (
            <button
              type="button"
              disabled={!canReview}
              onClick={openConfirm}
              className="self-start inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-bold transition-colors cursor-pointer"
            >
              {t('review')}
            </button>
          )}
        </section>
      )}

      {/* ⑩ Result panel — replaces the form; resultAgain resets it (§4.7). */}
      {result && (
        <section className="max-w-xl rounded-2xl bg-[#112643]/70 border border-[#1E3559] p-6 flex flex-col gap-3">
          <h2 className="text-lg font-extrabold text-white">
            {result.direction === 'CREDIT' ? t('resultCreditTitle') : t('resultDebitTitle')}
          </h2>
          <p className="text-sm font-mono text-[#d8e2ff]">{t('resultAmountLine', { email: result.userEmail, amount: result.amount, coin: result.coin })}</p>
          <p className="text-sm text-[#8c90a0]">{t('resultNewBalance', { balance: result.balanceAfter, coin: result.coin, available: result.availableAfter })}</p>
          <p className="text-sm text-amber-300 font-bold">{t('resultLiability', { total: result.localLedgerBalanceTotalAfter, coin: result.coin })}</p>
          <p className="text-xs font-mono text-[#8c90a0]">{t('resultEntryId', { id: result.entryId })}</p>
          <p className="text-xs text-[#8c90a0]">{t('resultAuditNote')}</p>
          {result.idempotentReplay && <p className="text-xs text-indigo-300">{t('resultReplay')}</p>}
          <button
            onClick={resetAfterResult}
            className="self-start mt-2 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-colors cursor-pointer"
          >
            {t('resultAgain')}
          </button>
        </section>
      )}

      {/* ⑨ Confirm modal — §4.6 */}
      {confirmOpen && coin && amountDecimal && reasonType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-2xl bg-[#0b1830] border border-[#1E3559] p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-extrabold text-white">
              {direction === 'CREDIT' ? t('confirmTitleCredit') : t('confirmTitleDebit')}
            </h2>

            <div role="alert" className="flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-100 text-xs leading-relaxed">
              <p className="flex items-start gap-2"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {t('warnPor')}</p>
              <p className="flex items-start gap-2"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {t('warnLiability')}</p>
              <p className="flex items-start gap-2"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {t('warnNotWithdrawal')}</p>
            </div>

            <div className="rounded-xl bg-[#020d24]/60 border border-[#1E3559] p-3.5 text-sm flex flex-col gap-1.5">
              <div className="flex justify-between gap-3">
                <span className="text-[#8c90a0]">{t('confirmTarget')}</span>
                <span className="font-mono text-white text-right break-all">{email.trim()}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-[#8c90a0]">{t('confirmAmount')}</span>
                <span className="font-mono text-white font-bold">{amountDecimal.toFixed()} {coin}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-[#8c90a0] shrink-0">{t('confirmReason')}</span>
                <span className="text-right text-[#d8e2ff]">{t(REASON_LABEL_KEY[reasonType] as 'reasonE2E')} — {normalizedDescription}</span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-[#afc6ff]">{t('confirmTypeEmail')}</label>
              <input
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                onBlur={() => setConfirmEmailTouched(true)}
                onPaste={(e) => e.preventDefault()}
                autoComplete="off"
                className={inputCls}
              />
              {confirmEmailTouched && confirmEmail.trim() !== '' && !confirmEmailMatches && (
                <p className="text-[11px] text-rose-300">{t('confirmMismatchEmail')}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-[#afc6ff]">{t('confirmTypeAmount')}</label>
              <input
                value={confirmAmount}
                onChange={(e) => setConfirmAmount(e.target.value)}
                onBlur={() => setConfirmAmountTouched(true)}
                onPaste={(e) => e.preventDefault()}
                autoComplete="off"
                inputMode="decimal"
                className={inputCls}
              />
              {confirmAmountTouched && confirmAmount.trim() !== '' && !confirmAmountMatches && (
                <p className="text-[11px] text-rose-300">{t('confirmMismatchAmount')}</p>
              )}
            </div>
            <p className="text-[11px] text-[#8c90a0]">{t('confirmPasteBlocked')}</p>

            {submitError && (
              <div className="px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-200 text-xs leading-relaxed">
                <ErrorMessage code={submitError.code} message={submitError.message} detail={submitError.detail} coin={coin} t={t} />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={closeConfirm}
                disabled={submitting}
                className="px-4 py-2.5 rounded-xl border border-[#1E3559] text-[#8c90a0] hover:text-white text-sm font-bold disabled:opacity-50 transition-colors cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={doSubmit}
                disabled={submitting || !confirmEmailMatches || !confirmAmountMatches}
                className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-40 transition-colors cursor-pointer ${direction === 'CREDIT' ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-amber-600 hover:bg-amber-500'}`}
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {direction === 'CREDIT' ? t('confirmSubmitCredit') : t('confirmSubmitDebit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
