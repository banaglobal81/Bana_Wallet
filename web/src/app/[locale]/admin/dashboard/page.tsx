'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LayoutDashboard, Users, ArrowUpRight, Check, ShieldCheck, RefreshCw, Download, ChevronRight } from 'lucide-react';
import {
  getAdminStats, listWithdrawals, getRecentDeposits,
  type AdminStats, type WithdrawalRequest, type WithdrawalStatus, type DepositFeedItem,
} from '@/utils/adminApi';

const STATUS_STYLE: Record<WithdrawalStatus, string> = {
  PENDING: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
  APPROVED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
  REJECTED: 'bg-rose-500/10 text-rose-400 border-rose-500/25',
  FAILED: 'bg-orange-500/10 text-orange-400 border-orange-500/25',
};

export default function AdminDashboardPage() {
  const t = useTranslations('adminDashboard');
  const tw = useTranslations('adminWithdrawals');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [deposits, setDeposits] = useState<DepositFeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, w, d] = await Promise.all([getAdminStats(), listWithdrawals(), getRecentDeposits()]);
      setStats(s);
      setWithdrawals(w.items.slice(0, 12));
      setDeposits(d);
    } catch {
      // surfaced as empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const cards = [
    { key: 'totalUsers', icon: Users, value: stats?.users.total ?? '—', sub: t('newThisWeek', { n: stats?.users.new7d ?? 0 }), color: 'text-[#528dff]', href: '/admin/users' },
    { key: 'pendingWithdrawals', icon: ArrowUpRight, value: stats?.withdrawals.pending ?? '—', sub: t('needsReview'), color: 'text-amber-400', href: '/admin/withdrawals' },
    { key: 'approved', icon: Check, value: stats?.withdrawals.approved ?? '—', sub: t('rejectedN', { n: stats?.withdrawals.rejected ?? 0 }), color: 'text-emerald-400', href: '/admin/withdrawals' },
    { key: 'admins', icon: ShieldCheck, value: stats?.users.admins ?? '—', sub: t('disabledN', { n: stats?.users.disabled ?? 0 }), color: 'text-indigo-400', href: '/admin/users' },
  ];

  return (
    <div className="flex-1 min-h-full bg-[#06132a] text-[#d8e2ff] p-4 sm:p-6 lg:p-8 flex flex-col gap-6 overflow-y-auto">
      <header className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center pb-2 border-b border-[#1E3559]/40">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <LayoutDashboard className="h-7 w-7 text-[#528dff]" />
            {t('pageTitle')}
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

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(({ key, icon: Icon, value, sub, color, href }) => (
          <Link
            key={key}
            href={href}
            className="p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] hover:border-[#528dff]/40 transition-colors flex flex-col gap-1"
          >
            <span className="text-[11px] font-mono uppercase tracking-widest text-[#8c90a0] font-bold flex items-center gap-1.5">
              <Icon className={`h-3.5 w-3.5 ${color}`} /> {t(key)}
            </span>
            <span className="text-3xl font-bold font-sans text-white mt-1">{value}</span>
            <span className="text-[11px] font-mono text-[#8c90a0]">{sub}</span>
          </Link>
        ))}
      </div>

      {/* Transactions: recent withdrawals (real) + recent deposits (best-effort) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent withdrawals */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="font-sans font-extrabold text-[#d8e2ff] text-sm uppercase tracking-wider flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4 text-[#528dff]" /> {t('recentWithdrawals')}
            </h3>
            <Link href="/admin/withdrawals" className="text-[11px] font-mono text-[#528dff] hover:text-white flex items-center gap-1 transition-colors">
              {t('viewAll')} <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          {loading ? (
            <p className="text-xs font-mono text-[#8c90a0] py-4 text-center">{t('loading')}</p>
          ) : withdrawals.length === 0 ? (
            <p className="text-xs font-mono text-[#8c90a0] py-6 text-center">{t('noWithdrawals')}</p>
          ) : (
            <div className="flex flex-col divide-y divide-[#1E3559]/40">
              {withdrawals.map((w) => (
                <div key={w.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white font-mono">{w.amount} {w.currency} <span className="text-[10px] text-[#8c90a0]">· {w.network}</span></div>
                    <div className="text-[11px] font-mono text-[#8c90a0] truncate">{w.email}</div>
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-1">
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[w.status]}`}>
                      {tw(`status${w.status}` as 'statusPENDING')}
                    </span>
                    <span className="text-[10px] font-mono text-[#8c90a0]">{new Date(w.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent deposits (best-effort, webhook-fed) */}
        <div className="p-6 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-4">
          <h3 className="font-sans font-extrabold text-[#d8e2ff] text-sm uppercase tracking-wider flex items-center gap-2">
            <Download className="h-4 w-4 text-emerald-400" /> {t('recentDeposits')}
          </h3>
          {loading ? (
            <p className="text-xs font-mono text-[#8c90a0] py-4 text-center">{t('loading')}</p>
          ) : deposits.length === 0 ? (
            <p className="text-[11px] font-mono text-[#8c90a0] py-6 text-center leading-relaxed">{t('noDeposits')}</p>
          ) : (
            <div className="flex flex-col divide-y divide-[#1E3559]/40">
              {deposits.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-emerald-400 font-mono">+{d.amount ?? '?'} {d.currency ?? ''}</div>
                    <div className="text-[10px] font-mono text-[#8c90a0] truncate">{d.userId ?? ''}</div>
                  </div>
                  <span className="text-[10px] font-mono text-[#8c90a0] shrink-0">{new Date(d.ts).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
