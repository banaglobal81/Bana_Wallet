'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Decimal from 'decimal.js';
import { Screen, Activity, SystemSettings } from '../types';
import { copyToClipboard } from '../utils/clipboard';
import { getNiaDeposits, getNiaWithdrawals, getNiaTrades } from '../utils/niaApi';
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  ArrowLeftRight, 
  CheckCircle, 
  UserCheck, 
  Copy, 
  Check, 
  Cpu, 
  RefreshCw,
  ExternalLink,
  Lock
} from 'lucide-react';

interface ActivityHistoryProps {
  activities: Activity[];
  settings: SystemSettings;
  onNavigate: (toScreen: Screen, direction: 'push' | 'push_back' | 'slide_up' | 'none') => void;
}

export default function ActivityHistory({ activities, settings, onNavigate }: ActivityHistoryProps) {
  const t = useTranslations('activity');
  const [filter, setFilter] = useState<'All' | 'Completed' | 'Pending'>('All');
  const [copiedTx, setCopiedTx] = useState<string | null>(null);

  // Live activity from Nia-Hub — deposits (Receive), withdrawals (Send) and trades
  // (Swap), merged and sorted newest-first. A SUCCESSFUL fetch is treated as live
  // even when empty (shows a real "no activity" state); demo data is only the
  // offline/error fallback so the UI is never blank in dev/preview.
  const [liveActs, setLiveActs] = useState<Activity[] | null>(null);
  const [source, setSource] = useState<'loading' | 'live' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    const mapStatus = (s: string): Activity['status'] => {
      const u = String(s ?? '').toUpperCase();
      if (u === 'PENDING') return 'Pending';
      if (u === 'FAILED' || u === 'REJECTED') return 'Failed';
      return 'Completed'; // COMPLETED, APPROVED, or anything else the hub returns
    };
    const fmt = (v: unknown) => {
      try { return new Date(v as any).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'; } catch { return ''; }
    };
    const parseTs = (v: unknown): number => {
      if (typeof v === 'number') return v;
      const n = Date.parse(String(v ?? ''));
      return Number.isNaN(n) ? 0 : n;
    };
    // Split a market symbol like "ETH_USDT" / "ETH/USDT" into [base, quote].
    const splitSymbol = (sym: unknown): [string, string] => {
      const parts = String(sym ?? '').split(/[_/-]/);
      return [parts[0] || String(sym ?? ''), parts[1] || ''];
    };

    (async () => {
      try {
        const [deps, wds, trades] = await Promise.all([
          getNiaDeposits(), getNiaWithdrawals(), getNiaTrades(),
        ]);
        if (cancelled) return;

        type Row = { ts: number; act: Activity };
        const rows: Row[] = [
          ...deps.map((d: any): Row => ({
            ts: parseTs(d.createdAt ?? d.ts),
            act: {
              id: d.id || `dep-${d.txHash || d.createdAt || ''}`,
              type: 'Receive', title: `Deposited ${d.amount} ${d.currency}`,
              description: `${d.network || ''} network deposit`,
              fromAmount: '0', fromSymbol: '', toAmount: String(d.amount ?? ''), toSymbol: d.currency || '',
              timestamp: fmt(d.createdAt ?? d.ts), status: mapStatus(d.status), txHash: d.txHash || d.id || '', gasFee: '—',
            },
          })),
          ...wds.map((w: any): Row => ({
            ts: parseTs(w.createdAt ?? w.ts),
            act: {
              id: w.id || w.withdrawalId || `wd-${w.createdAt || ''}`,
              type: 'Send', title: `Withdrew ${w.amount} ${w.currency}`,
              description: w.pendingApproval ? t('awaitingApproval') : `${w.network || ''} network withdrawal`,
              fromAmount: String(w.amount ?? ''), fromSymbol: w.currency || '', toAmount: '0', toSymbol: '',
              timestamp: fmt(w.createdAt ?? w.ts), status: mapStatus(w.status), txHash: w.txHash || w.withdrawalId || w.id || '', gasFee: '—',
            },
          })),
          ...trades.map((t: any): Row => {
            const [base, quote] = splitSymbol(t.symbol);
            const isBuy = String(t.side ?? '').toUpperCase() === 'BUY';
            const qty = String(t.quantity ?? t.qty ?? '0');
            // Notional = qty * price (in the quote currency). decimal.js for the money math (rule #2).
            let notional = '0';
            try { notional = new Decimal(qty || 0).mul(t.price ?? 0).toFixed(); } catch { notional = '0'; }
            // BUY: pay quote, receive base. SELL: pay base, receive quote.
            const fromSymbol = isBuy ? quote : base;
            const fromAmount = isBuy ? notional : qty;
            const toSymbol = isBuy ? base : quote;
            const toAmount = isBuy ? qty : notional;
            return {
              ts: parseTs(t.createdAt ?? t.ts),
              act: {
                id: `trade-${t.id ?? t.tradeId ?? t.orderId ?? t.createdAt ?? ''}`,
                type: 'Swap',
                title: fromSymbol && toSymbol ? `Swapped ${fromSymbol} for ${toSymbol}` : 'Trade executed',
                description: `${t.symbol || ''}${t.side ? ' ' + String(t.side).toUpperCase() : ''}`.trim(),
                fromAmount, fromSymbol, toAmount, toSymbol,
                timestamp: fmt(t.createdAt ?? t.ts), status: mapStatus(t.status),
                txHash: t.txHash || t.tradeId || t.orderId || t.id || '', gasFee: '—',
              },
            };
          }),
        ];

        rows.sort((a, b) => b.ts - a.ts); // newest first
        if (cancelled) return;
        setLiveActs(rows.map((r) => r.act));
        setSource('live'); // successful fetch → live, even when empty
      } catch {
        if (!cancelled) { setLiveActs(null); setSource('error'); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleCopyTx = async (hash: string) => {
    await copyToClipboard(hash);
    setCopiedTx(hash);
    setTimeout(() => setCopiedTx(null), 1500);
  };

  // On a successful fetch use the live records (even if empty); fall back to the
  // Only ever show real data — never mock. Empty while loading or on error.
  const sourceActs = source === 'live' ? (liveActs ?? []) : [];
  const filteredActivities = sourceActs.filter((act) => {
    if (filter === 'All') return true;
    return act.status === filter;
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'Swap':
        return <ArrowLeftRight className="h-4.5 w-4.5 text-indigo-400" />;
      case 'Send':
        return <ArrowUpRight className="h-4.5 w-4.5 text-rose-400" />;
      case 'Receive':
        return <ArrowDownLeft className="h-4.5 w-4.5 text-emerald-400" />;
      case 'Approve':
        return <UserCheck className="h-4.5 w-4.5 text-purple-400" />;
      default:
        return <Lock className="h-4.5 w-4.5 text-slate-400" />;
    }
  };

  const handleNav = (target: Screen, dir: 'push' | 'push_back' | 'none') => {
    onNavigate(target, dir);
  };

  return (
    <div className="flex-1 min-h-full bg-[#020617] text-slate-100 p-4 sm:p-6 lg:p-8 flex flex-col gap-6 overflow-y-auto">

      {/* Safe Breadcrumbs Navigation List (Saves xpath lookups additionally!) */}
      <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-mono text-slate-400 bg-slate-900 p-3 rounded-2xl border border-slate-800 select-none">
        <span className="text-indigo-400 font-bold">{t('breadcrumbRegistry')}</span>
        <a
          href="#portfolio"
          onClick={(e) => { e.preventDefault(); handleNav('PORTFOLIO_DASHBOARD', 'push_back'); }}
          className="hover:text-slate-200 hover:underline transition-all cursor-pointer font-semibold"
        >
          {t('breadcrumbPortfolio')}
        </a>
        <span>/</span>
        <a
          href="#swap"
          onClick={(e) => { e.preventDefault(); handleNav('SWAP_INTERFACE', 'push'); }}
          className="hover:text-slate-200 hover:underline transition-all cursor-pointer font-semibold"
        >
          {t('breadcrumbSwap')}
        </a>
        <span>/</span>
        <a
          href="#settings"
          onClick={(e) => { e.preventDefault(); handleNav('SETTINGS_INTERFACE', 'push'); }}
          className="hover:text-slate-200 hover:underline transition-all cursor-pointer font-semibold"
        >
          {t('breadcrumbSettings')}
        </a>
      </nav>

      {/* Main Page Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center pb-3 border-b border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            {t('pageTitle')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-mono">
            {t('pageSubtitle')}
          </p>
        </div>

        {/* Quick Filter tabs */}
        <div className="flex bg-slate-950 p-1.5 rounded-xl border border-slate-800 select-none text-xs self-start sm:self-center gap-1.5">
          {(['All', 'Completed', 'Pending'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 rounded-lg font-bold font-sans transition-all cursor-pointer ${
                filter === tab
                  ? 'bg-indigo-600 text-white shadow-md font-extrabold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab === 'All' ? t('filterAll') : tab === 'Completed' ? t('filterCompleted') : t('filterPending')}
            </button>
          ))}
        </div>
      </header>

      {/* Main Activities Board Card */}
      <section className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col gap-4 shadow-lg bento-hover">
        
        {/* Table Rows layout */}
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full min-w-[680px] text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400 uppercase tracking-wider font-bold">
                <th className="pb-3 pl-2.5 font-semibold">{t('colAction')}</th>
                <th className="pb-3 font-semibold">{t('colDescription')}</th>
                <th className="pb-3 font-semibold">{t('colInputsOutputs')}</th>
                <th className="pb-3 text-right font-semibold">{t('colNetworkGas')}</th>
                <th className="pb-3 text-right font-semibold">{t('colStatusHash')}</th>
                <th className="pb-3 text-right font-semibold pr-2.5">{t('colCopy')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {filteredActivities.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-sm font-mono text-slate-450 whitespace-normal break-words">
                    <span className="block sticky left-0 mx-auto max-w-[80vw] px-2">
                      {t('noActivity', { filter })}
                    </span>
                  </td>
                </tr>
              ) : (
                filteredActivities.map((act) => (
                  <tr key={act.id} className="hover:bg-slate-950/40 transition-colors group">
                    
                    {/* Symbol type indicator */}
                    <td className="py-4 pl-2.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-slate-950 border border-slate-805 flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
                          {getIcon(act.type)}
                        </div>
                        <div>
                          <div className="font-extrabold text-white text-[14px] group-hover:text-indigo-400 transition-colors">
                            {act.type}
                          </div>
                          <span className="text-[10px] font-mono text-slate-500 font-semibold">{act.timestamp}</span>
                        </div>
                      </div>
                    </td>

                    {/* Brief description summary */}
                    <td className="py-4 max-w-xs">
                      <div className="text-xs font-sans text-slate-200 font-semibold">{act.title}</div>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-mono leading-relaxed truncate">
                        {act.description}
                      </p>
                    </td>

                    {/* Inputs & Outputs transfer value representation */}
                    <td className="py-4 font-mono text-xs text-white">
                      {act.type === 'Swap' ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-rose-450 text-rose-400">-{act.fromAmount} {act.fromSymbol}</span>
                          <span className="text-slate-500 text-[10px] font-bold">&rarr;</span>
                          <span className="text-emerald-450 text-emerald-400">+{act.toAmount} {act.toSymbol}</span>
                        </div>
                      ) : act.type === 'Send' ? (
                        <span className="text-rose-450 text-rose-400">-{act.fromAmount} {act.fromSymbol}</span>
                      ) : act.type === 'Receive' ? (
                        <span className="text-emerald-450 text-emerald-400">+{act.toAmount} {act.toSymbol}</span>
                      ) : (
                        <span className="text-purple-300">{t('approveSpend')}</span>
                      )}
                    </td>

                    {/* Gas Fee */}
                    <td className="py-4 text-right font-mono text-xs text-slate-400">
                      <div>{act.gasFee}</div>
                      <span className="text-[9px] uppercase tracking-wide">{t('privateRelayer')}</span>
                    </td>

                    {/* Transaction Status Badge */}
                    <td className="py-4 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className={`inline-flex items-center gap-1 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                          act.status === 'Completed'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : act.status === 'Pending'
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                            : 'bg-red-500/10 text-red-500 border-red-500/20'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            act.status === 'Completed'
                              ? 'bg-emerald-400'
                              : act.status === 'Pending'
                              ? 'bg-blue-400'
                              : 'bg-red-500'
                          } animate-pulse`} />
                          {act.status}
                        </span>
                        
                        <span className="text-[10px] font-mono text-slate-450 font-semibold truncate max-w-[100px]">
                          {act.txHash}
                        </span>
                      </div>
                    </td>

                    {/* Copy hash helper */}
                    <td className="py-4 text-right pr-2.5">
                      <button 
                        onClick={() => handleCopyTx(act.txHash)}
                        className="p-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/30 rounded-xl transition-all cursor-pointer text-slate-400 hover:text-indigo-400 inline-flex items-center justify-center"
                        title={t('copyTxTitle')}
                      >
                        {copiedTx === act.txHash ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </td>

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Sync Status Bottom Row */}
        <div className="mt-4 pt-4 border-t border-slate-800 flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center text-xs text-slate-400">
          <span className="flex items-center gap-1.5 font-mono">
            {source === 'loading' ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 text-indigo-400 animate-spin" />
                {t('syncing')}
              </>
            ) : source === 'live' ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {t('liveRecords', { count: liveActs?.length ?? 0 })}
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5 text-rose-400" />
                {t('loadError')}
              </>
            )}
          </span>
          <span className="font-mono">{t('addressIndex')}</span>
        </div>

      </section>

    </div>
  );
}
