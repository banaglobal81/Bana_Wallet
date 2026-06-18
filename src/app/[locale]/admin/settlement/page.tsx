'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Decimal from 'decimal.js';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import {
  Building2,
  Coins,
  Receipt,
  RefreshCw,
  ShieldCheck,
  ArrowLeft,
  Lock,
} from 'lucide-react';
import { useApp } from '@/app/providers';
import { getNiaUnsettled, getNiaSettlementHistory } from '@/utils/niaApi';

export default function AdminSettlementPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';
  const { settings } = useApp();
  const t = useTranslations('settlement');

  // Settlement data state
  const [unsettled, setUnsettled] = useState<any>(null);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [admState, setAdmState] = useState<'loading' | 'ok' | 'error'>('loading');

  const loadAdmin = async () => {
    setAdmState('loading');
    try {
      const [u, h] = await Promise.all([getNiaUnsettled(), getNiaSettlementHistory()]);
      setUnsettled(u);
      setSettlements(h);
      setAdmState('ok');
    } catch {
      setAdmState('error');
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadAdmin();
    }
  }, [isAdmin]);

  // Role guard — non-admin users see a clear access-denied panel
  if (!isAdmin) {
    return (
      <div className="flex-1 min-h-full bg-[#06132a] text-[#d8e2ff] p-4 sm:p-6 lg:p-8 flex flex-col items-center justify-center gap-6">
        <div className="max-w-md w-full p-8 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col items-center gap-5 text-center">
          <div className="p-4 bg-rose-500/10 rounded-full border border-rose-500/20">
            <Lock className="h-8 w-8 text-rose-400" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-white">{t('accessDeniedTitle')}</h2>
            <p className="mt-2 text-sm text-[#8c90a0] leading-relaxed">
              {t.rich('accessDeniedBody', {
                highlight: (chunks) => (
                  <span className="text-amber-400 font-bold">{chunks}</span>
                ),
              })}
            </p>
          </div>
          <Link
            href="/portfolio"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2E7DFF] text-white text-sm font-bold hover:bg-[#1a6aff] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('backToPortfolio')}
          </Link>
        </div>
      </div>
    );
  }

  // Derive unsettled fee entries using decimal.js — no Number()/parseFloat()
  const unsettledFees: Array<[string, string]> =
    unsettled?.unsettledFees && typeof unsettled.unsettledFees === 'object'
      ? Object.entries(unsettled.unsettledFees as Record<string, unknown>).map(([cur, amt]) => [
          cur,
          // Safely wrap via Decimal; fall back to '0.00' on bad input
          (() => {
            try {
              return new Decimal(String(amt)).toFixed(8);
            } catch {
              return '0.00';
            }
          })(),
        ])
      : [];

  return (
    <div className="flex-1 min-h-full bg-[#06132a] text-[#d8e2ff] p-4 sm:p-6 lg:p-8 flex flex-col gap-6 overflow-y-auto">

      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center pb-2 border-b border-[#1E3559]/40">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <Building2 className="h-7 w-7 text-[#528dff]" />
            {t('pageTitle')}
          </h1>
          <p className="text-xs sm:text-sm text-[#8c90a0] mt-1 font-mono">
            {t('pageSubtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/25 rounded-lg text-amber-400 font-semibold text-xs font-mono select-none">
            <Building2 className="h-4 w-4" /> {t('adminModeBadge')}
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/25 rounded-lg text-emerald-400 font-semibold text-xs font-mono select-none">
            <ShieldCheck className="h-4 w-4" /> {t('niaBadge')}
          </span>
        </div>
      </header>

      {/* Broker identity card */}
      <div className="p-6 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-sans font-extrabold text-[#d8e2ff] text-sm uppercase tracking-wider flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#528dff]" /> {t('brokerTenantTitle')}
          </h3>
          <button
            onClick={loadAdmin}
            aria-label="Refresh settlement data"
            className="p-2 bg-[#020d24]/60 hover:bg-[#1e3459] border border-[#1E3559] rounded-lg text-[#8c90a0] hover:text-white transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${admState === 'loading' ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 p-3.5 bg-[#020d24]/60 border border-[#1E3559] rounded-xl">
          <span className="text-[11px] font-mono text-[#8c90a0]">{t('tenantIdLabel')}</span>
          <span className="text-xs font-mono text-[#afc6ff] truncate">
            {unsettled?.tenantId || settings.connectedWallet.slice(0, 18) + '…'}
          </span>
        </div>
      </div>

      {/* Commission + trade count */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-1">
          <span className="text-[11px] font-mono uppercase tracking-widest text-[#8c90a0] font-bold flex items-center gap-1.5">
            <Coins className="h-3.5 w-3.5 text-amber-400" /> {t('unsettledCommission')}
          </span>
          {admState === 'loading' ? (
            <span className="text-sm text-[#8c90a0] mt-1">{t('loading')}</span>
          ) : admState === 'error' ? (
            <span className="text-sm text-rose-300 mt-1">{t('failedToLoad')}</span>
          ) : unsettledFees.length === 0 ? (
            <span className="text-2xl font-bold font-sans text-white mt-1">
              0.00 <span className="text-sm text-[#8c90a0]">USDT</span>
            </span>
          ) : (
            <div className="mt-1 flex flex-col gap-0.5">
              {unsettledFees.map(([cur, amt]) => (
                <span key={cur} className="text-lg font-bold font-sans text-white">
                  {amt} <span className="text-xs text-[#8c90a0]">{cur}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-1">
          <span className="text-[11px] font-mono uppercase tracking-widest text-[#8c90a0] font-bold flex items-center gap-1.5">
            <Receipt className="h-3.5 w-3.5 text-[#528dff]" /> {t('tradeCount')}
          </span>
          <span className="text-2xl font-bold font-sans text-white mt-1">
            {unsettled?.tradeCount ?? 0}
          </span>
        </div>
      </div>

      {/* Settlement history */}
      <div className="p-6 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-4">
        <h3 className="font-sans font-extrabold text-[#d8e2ff] text-sm uppercase tracking-wider">
          {t('settlementHistory')}
        </h3>
        {admState === 'loading' ? (
          <p className="text-xs font-mono text-[#8c90a0] py-6 text-center">{t('loading')}</p>
        ) : admState === 'error' ? (
          <p className="text-xs font-mono text-rose-300 py-6 text-center">
            {t('historyError')}
          </p>
        ) : settlements.length === 0 ? (
          <div className="py-8 text-center flex flex-col items-center gap-2">
            <div className="p-3 bg-[#020d24]/60 rounded-full border border-[#1E3559]">
              <Receipt className="h-6 w-6 text-[#8c90a0]" />
            </div>
            <p className="text-sm font-bold text-white">{t('noSettlementsYet')}</p>
            <p className="text-xs text-[#8c90a0] max-w-xs">
              {t('noSettlementsBody')}
            </p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-[#1E3559]/40">
            {settlements.slice(0, 8).map((s, i) => {
              // Use decimal.js to display amount — guard against bad shapes
              let displayAmt = s.amount ?? '—';
              try {
                if (s.amount != null) displayAmt = new Decimal(String(s.amount)).toFixed(8);
              } catch { /* leave as-is */ }

              return (
                <div key={s.id ?? i} className="flex items-center justify-between py-2.5 gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-emerald-400 font-mono">
                      {displayAmt} {s.currency}
                    </div>
                    <div className="text-[10px] font-mono text-[#8c90a0] truncate">
                      {s.settledAt}
                    </div>
                  </div>
                  <span className="shrink-0 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {t('settled')}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Admin note */}
      <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/15 flex items-start gap-3">
        <Building2 className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
        <p className="text-xs text-[#8c90a0] leading-relaxed">
          {t.rich('adminNoteBody', {
            highlight: (chunks) => (
              <span className="text-slate-200 font-bold">{chunks}</span>
            ),
          })}
        </p>
      </div>
    </div>
  );
}
