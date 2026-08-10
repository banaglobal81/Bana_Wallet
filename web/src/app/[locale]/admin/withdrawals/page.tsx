'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import Decimal from 'decimal.js';
import { ArrowUpRight, RefreshCw, Check, X, Loader2, ShieldAlert, ArrowLeft, Send, CheckCircle2, AlertCircle, HelpCircle, CircleHelp } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import {
  listWithdrawals, approveWithdrawal, rejectWithdrawal, submitWithdrawalTx, getSolvency,
  type WithdrawalRequest, type WithdrawalStatus, type SolvencyIncident,
} from '@/utils/adminApi';
import { SolvencyIncidentBanner } from '@/components/admin/reserve/SolvencyIncidentBanner';

const STATUS_STYLE: Record<WithdrawalStatus, string> = {
  PENDING: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
  PROCESSING: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/25',
  // A-11 §4.1 — AWAITING_ONCHAIN uses the same amber as PENDING/STALE elsewhere
  // in this admin surface: "approved, not yet moved" reads as a caution state.
  AWAITING_ONCHAIN: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
  APPROVED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
  REJECTED: 'bg-rose-500/10 text-rose-400 border-rose-500/25',
  FAILED: 'bg-orange-500/10 text-orange-400 border-orange-500/25',
};

// A-5 §2.5 — which of the 3 outcome buckets a reason falls into. Never shown
// as a raw "failed"/"try again" without this classification (ADM-2/W-5).
function verifyOutcomeBucket(reason: string): 'pass' | 'fail' | 'inconclusive' {
  if (reason === 'PASS') return 'pass';
  if (['TX_NOT_FOUND', 'TX_PENDING', 'INSUFFICIENT_CONFIRMATIONS', 'RPC_UNAVAILABLE'].includes(reason)) return 'inconclusive';
  return 'fail'; // TX_REVERTED / NO_TRANSFER_EVENT / WRONG_CONTRACT / WRONG_RECIPIENT / AMOUNT_MISMATCH / TX_ALREADY_CONSUMED
}

// T-16 §8.2 (AC-10, J-6) — 4-state admin-adjustment marker: net>0 / net<0 /
// net==0 (nothing rendered) / net==null ("couldn't confirm", never "none").
// Amount comparisons use decimal.js only (CLAUDE.md rule 2). Colors are
// deliberately violet/slate — never amber/indigo/emerald/rose, which this row
// already uses for the rail and status badges (§8.2 — "must be distinguishable").
function AdminCreditMarker({ net, coin, t }: { net: string | null; coin: string; t: ReturnType<typeof useTranslations> }) {
  const pill = 'mt-1 inline-flex items-center gap-1 w-fit text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border';
  if (net == null) {
    return (
      <div data-testid="admin-credit-marker-unknown" title={t('adminCreditMarkerHint')} className={`${pill} bg-slate-500/10 text-slate-300 border-slate-500/25`}>
        <CircleHelp className="h-2.5 w-2.5" /> {t('adminCreditMarkerUnknown')}
      </div>
    );
  }
  const d = new Decimal(net);
  if (d.eq(0)) return null;
  if (d.gt(0)) {
    return (
      <div data-testid="admin-credit-marker" title={t('adminCreditMarkerHint')} className={`${pill} bg-violet-500/10 text-violet-300 border-violet-500/25`}>
        {t('adminCreditMarker', { amount: d.toFixed(), coin })}
      </div>
    );
  }
  return (
    <div data-testid="admin-credit-marker-negative" title={t('adminCreditMarkerHint')} className={`${pill} bg-slate-500/10 text-slate-300 border-slate-500/25`}>
      {t('adminCreditMarkerNegative', { amount: d.abs().toFixed(), coin })}
    </div>
  );
}

export default function AdminWithdrawalsPage() {
  const t = useTranslations('adminWithdrawals');
  const nav = useTranslations('nav');
  const [items, setItems] = useState<WithdrawalRequest[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [txHashDraft, setTxHashDraft] = useState<Record<string, string>>({});
  const [t2Incidents, setT2Incidents] = useState<SolvencyIncident[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { items, pendingCount } = await listWithdrawals();
      setItems(items);
      setPendingCount(pendingCount);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }

    // AW-1 — this queue must show WHY execution is halted, not just fail silently.
    try {
      const solvency = await getSolvency();
      setT2Incidents(solvency.incidents.filter((i) => i.code === 'AUTHORITY_T2'));
    } catch {
      // non-fatal for this page — the queue itself still loaded above
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const approve = async (w: WithdrawalRequest) => {
    const confirmMsg = w.balanceAuthorityAtRequest === 'LOCAL' ? t('confirmApproveLocal') : t('confirmApprove', { amount: w.amount, currency: w.currency });
    if (!window.confirm(confirmMsg)) return;
    setBusyId(w.id);
    setError(null);
    try {
      await approveWithdrawal(w.id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (w: WithdrawalRequest) => {
    const reason = window.prompt(t('rejectReasonPrompt')) ?? '';
    setBusyId(w.id);
    setError(null);
    try {
      await rejectWithdrawal(w.id, reason);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const [verifyResult, setVerifyResult] = useState<Record<string, { ok: boolean; error?: string; reason?: string }>>({});

  const submitTx = async (w: WithdrawalRequest) => {
    const txHash = (txHashDraft[w.id] ?? '').trim();
    if (!txHash) return;
    setBusyId(w.id);
    setError(null);
    setVerifyResult((prev) => ({ ...prev, [w.id]: undefined as never }));
    try {
      const outcome = await submitWithdrawalTx(w.id, txHash);
      setVerifyResult((prev) => ({ ...prev, [w.id]: outcome }));
      if (outcome.ok) await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const trunc = (a: string) => (a.length > 18 ? `${a.slice(0, 10)}…${a.slice(-6)}` : a);

  return (
    <div className="flex-1 min-h-full bg-[#06132a] text-[#d8e2ff] p-4 sm:p-6 lg:p-8 flex flex-col gap-6 overflow-y-auto">
      {/* Back to Settings — this page is opened from the Settings page. */}
      <Link
        href="/admin/settings"
        className="self-start flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#112643]/70 border border-[#1E3559] text-[#afc6ff] hover:text-white hover:bg-[#1e3459] text-sm font-bold transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> {nav('settings')}
      </Link>
      <header className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center pb-2 border-b border-[#1E3559]/40">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <ArrowUpRight className="h-7 w-7 text-[#528dff]" />
            {t('pageTitle')}
            {pendingCount > 0 && (
              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                {t('pendingCount', { count: pendingCount })}
              </span>
            )}
          </h1>
          <p className="text-xs sm:text-sm text-[#8c90a0] mt-1 font-mono">{t('pageSubtitle')}</p>
        </div>
        <button
          onClick={load}
          aria-label={t('refresh')}
          className="self-start p-2 rounded-lg border border-[#1E3559] bg-[#020d24]/60 hover:bg-[#1e3459] text-[#8c90a0] hover:text-white transition-colors cursor-pointer"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* A-8 §7.3 AW-1 — T2 authority violation halts LOCAL-rail execution; the queue must say why. */}
      <SolvencyIncidentBanner incidents={t2Incidents} />

      <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[#528dff]/5 border border-[#528dff]/20">
        <ShieldAlert className="h-4 w-4 text-[#528dff] shrink-0 mt-0.5" />
        <p className="text-xs text-[#8c90a0] leading-relaxed">{t('securityNote')}</p>
      </div>

      {error && (
        <div className="px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm">{error}</div>
      )}

      <div className="rounded-2xl bg-[#112643]/70 border border-[#1E3559] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1E3559] text-left text-[11px] font-mono uppercase tracking-wider text-[#8c90a0]">
                <th className="px-4 py-3 font-semibold">{t('colUser')}</th>
                <th className="px-4 py-3 font-semibold">{t('colAmount')}</th>
                <th className="px-4 py-3 font-semibold">{t('colRail')}</th>
                <th className="px-4 py-3 font-semibold">{t('colTo')}</th>
                <th className="px-4 py-3 font-semibold">{t('colStatus')}</th>
                <th className="px-4 py-3 font-semibold text-right">{t('colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-[#8c90a0] font-mono text-xs">{t('loading')}</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-[#8c90a0] font-mono text-xs">{t('queueEmpty')}</td></tr>
              ) : (
                items.map((w) => {
                  const vr = verifyResult[w.id];
                  return (
                    <tr key={w.id} className="border-b border-[#1E3559]/40 last:border-0 align-top">
                      <td className="px-4 py-3">
                        <div className="font-mono text-[#d8e2ff] text-xs">{w.email}</div>
                        <div className="text-[10px] font-mono text-[#8c90a0]">{new Date(w.createdAt).toLocaleString()}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono text-white font-bold">{w.amount} {w.currency}</div>
                        {w.feeAmount != null && (
                          <div className="text-[10px] font-mono text-[#8c90a0]">{t('feeAmount', { fee: w.feeAmount })}</div>
                        )}
                        {w.debitTotal != null && (
                          <div className="text-[10px] font-mono text-[#8c90a0]">{t('debitTotal', { total: w.debitTotal })}</div>
                        )}
                        <div className="text-[10px] font-mono text-[#8c90a0]">{w.network}</div>
                        {/* T-16 §8.2 (AC-10) — judgement material only; never
                            changes approve/reject button state (§8.2 rule). */}
                        <AdminCreditMarker net={w.adminAdjustmentNetCredit} coin={w.currency} t={t} />
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                            w.balanceAuthorityAtRequest === 'LOCAL'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                              : 'bg-blue-500/10 text-blue-400 border-blue-500/25'
                          }`}
                        >
                          {t(w.balanceAuthorityAtRequest === 'LOCAL' ? 'railLocal' : 'railHub')}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[#afc6ff]">{trunc(w.toAddress)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[w.status]}`}>
                          {t(`status${w.status}` as 'statusPENDING')}
                        </span>
                        {w.rejectionReason && <div className="text-[10px] text-[#8c90a0] mt-1 max-w-[180px]">{w.rejectionReason}</div>}
                        {w.lastError && <div className="text-[10px] text-orange-400/80 mt-1 max-w-[180px]">{w.lastError}</div>}

                        {w.status === 'AWAITING_ONCHAIN' && (
                          <div className="mt-2 flex flex-col gap-1.5 max-w-[220px]">
                            <input
                              value={txHashDraft[w.id] ?? ''}
                              onChange={(e) => setTxHashDraft((prev) => ({ ...prev, [w.id]: e.target.value }))}
                              placeholder={t('txHashPlaceholder')}
                              className="px-2 py-1.5 rounded-lg bg-[#020d24] border border-[#1E3559] text-white text-[11px] font-mono w-full"
                            />
                            <button
                              disabled={busyId === w.id || !(txHashDraft[w.id] ?? '').trim()}
                              onClick={() => submitTx(w)}
                              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-[#2E7DFF]/40 bg-[#2E7DFF]/10 text-[#2E7DFF] hover:bg-[#2E7DFF]/20 disabled:opacity-50 transition-colors cursor-pointer"
                            >
                              {busyId === w.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                              {t('verifyAndSettle')}
                            </button>
                            {vr && !vr.ok && (
                              (() => {
                                const bucket = verifyOutcomeBucket(vr.reason ?? '');
                                if (bucket === 'inconclusive') {
                                  return (
                                    <p className="flex items-start gap-1 text-[10px] text-[#8c90a0]">
                                      <HelpCircle className="h-3 w-3 shrink-0 mt-0.5" /> {t('verifyInconclusive')}: {vr.error}
                                    </p>
                                  );
                                }
                                return (
                                  <p className="flex items-start gap-1 text-[10px] text-rose-300">
                                    <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" /> {t('verifyFailed')}: {vr.error}
                                  </p>
                                );
                              })()
                            )}
                            {vr?.ok && (
                              <p className="flex items-start gap-1 text-[10px] text-emerald-400">
                                <CheckCircle2 className="h-3 w-3 shrink-0 mt-0.5" /> {t('verifyPassed')}
                              </p>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {w.status === 'PENDING' || w.status === 'FAILED' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              disabled={busyId === w.id}
                              onClick={() => approve(w)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors cursor-pointer"
                            >
                              {busyId === w.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                              {t(w.balanceAuthorityAtRequest === 'LOCAL' ? 'approveLocal' : 'approve')}
                            </button>
                            <button
                              disabled={busyId === w.id}
                              onClick={() => reject(w)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 disabled:opacity-50 transition-colors cursor-pointer"
                            >
                              <X className="h-3.5 w-3.5" /> {t('reject')}
                            </button>
                          </div>
                        ) : (
                          <div className="text-right text-[10px] font-mono text-[#8c90a0]">
                            {w.reviewedAt ? new Date(w.reviewedAt).toLocaleString() : '—'}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
