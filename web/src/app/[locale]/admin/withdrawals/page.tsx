'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUpRight, RefreshCw, Check, X, Loader2, ShieldAlert, ArrowLeft } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import {
  listWithdrawals, approveWithdrawal, rejectWithdrawal,
  type WithdrawalRequest, type WithdrawalStatus,
} from '@/utils/adminApi';

const STATUS_STYLE: Record<WithdrawalStatus, string> = {
  PENDING: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
  PROCESSING: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/25',
  APPROVED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
  REJECTED: 'bg-rose-500/10 text-rose-400 border-rose-500/25',
  FAILED: 'bg-orange-500/10 text-orange-400 border-orange-500/25',
};

export default function AdminWithdrawalsPage() {
  const t = useTranslations('adminWithdrawals');
  const nav = useTranslations('nav');
  const [items, setItems] = useState<WithdrawalRequest[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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
  }, []);

  useEffect(() => { load(); }, [load]);

  const approve = async (w: WithdrawalRequest) => {
    if (!window.confirm(t('confirmApprove', { amount: w.amount, currency: w.currency }))) return;
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
                <th className="px-4 py-3 font-semibold">{t('colTo')}</th>
                <th className="px-4 py-3 font-semibold">{t('colStatus')}</th>
                <th className="px-4 py-3 font-semibold text-right">{t('colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-[#8c90a0] font-mono text-xs">{t('loading')}</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-[#8c90a0] font-mono text-xs">{t('queueEmpty')}</td></tr>
              ) : (
                items.map((w) => (
                  <tr key={w.id} className="border-b border-[#1E3559]/40 last:border-0 align-top">
                    <td className="px-4 py-3">
                      <div className="font-mono text-[#d8e2ff] text-xs">{w.email}</div>
                      <div className="text-[10px] font-mono text-[#8c90a0]">{new Date(w.createdAt).toLocaleString()}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-white font-bold">{w.amount} {w.currency}</div>
                      <div className="text-[10px] font-mono text-[#8c90a0]">{w.network}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#afc6ff]">{trunc(w.toAddress)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[w.status]}`}>
                        {t(`status${w.status}` as 'statusPENDING')}
                      </span>
                      {w.rejectionReason && <div className="text-[10px] text-[#8c90a0] mt-1 max-w-[180px]">{w.rejectionReason}</div>}
                      {w.lastError && <div className="text-[10px] text-orange-400/80 mt-1 max-w-[180px]">{w.lastError}</div>}
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
                            {t('approve')}
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
