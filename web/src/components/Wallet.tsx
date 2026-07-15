'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Decimal from 'decimal.js';
import { Screen, SystemSettings } from '../types'; // SystemSettings kept for WalletProps signature
import { getNiaBalance, getNiaMarkets } from '../utils/niaApi';
import { getStakePositions } from '../utils/stakingApi';
import { getManagedCoins } from '../utils/coinsApi';
import StakedSummaryCard from './staking/StakedSummaryCard';
import {
  Wallet as WalletIcon,
  Download,
  Upload,
  ShieldCheck,
  RefreshCw,
  ChevronRight,
  Activity as ActivityIcon,
} from 'lucide-react';

interface WalletProps {
  settings: SystemSettings;
  onNavigate: (toScreen: Screen, direction: 'push' | 'push_back' | 'slide_up' | 'none') => void;
}

interface BalanceRow { walletType: string; currency: string; balance: string; locked?: string }

/**
 * Staked principal, as balance rows — one per coin, summed across the user's
 * ACTIVE positions. Staking never moves funds in the Nia wallet, so this never
 * appears in the hub's response; without it the table reads "no balances" even
 * for a user who has coins staked. Reported as locked (not available), because
 * that is exactly what it is: held until maturity.
 */
function stakedRows(positions: { coin: string; principal: string; status: string }[]): BalanceRow[] {
  const byCoin = new Map<string, Decimal>();
  for (const p of positions) {
    if (p.status !== 'ACTIVE') continue;
    byCoin.set(p.coin, (byCoin.get(p.coin) ?? new Decimal(0)).plus(p.principal || '0'));
  }
  return [...byCoin.entries()]
    .filter(([, total]) => total.gt(0))
    .map(([currency, total]) => ({
      walletType: 'staking',
      currency,
      balance: '0',
      locked: total.toFixed(),
    }));
}

/**
 * Every coin the tenant supports — the hub's markets plus admin-added custom
 * coins (BANA lives there). Used to pad the table with real zero rows, so a coin
 * you can deposit is visible before you hold any of it.
 */
function supportedSymbols(
  markets: { currencies?: { symbol?: string }[] } | null,
  managed: { symbol: string }[],
): string[] {
  const out = new Set<string>();
  for (const c of markets?.currencies ?? []) {
    if (c?.symbol) out.add(c.symbol.toUpperCase());
  }
  for (const m of managed) {
    if (m?.symbol) out.add(m.symbol.toUpperCase());
  }
  return [...out];
}

/** Zero rows for supported coins the user holds none of, so the list is complete. */
function zeroRows(held: BalanceRow[], symbols: string[]): BalanceRow[] {
  const present = new Set(held.map((r) => (r.currency ?? '').toUpperCase()));
  return symbols
    .filter((s) => !present.has(s))
    .sort()
    .map((currency) => ({ walletType: '', currency, balance: '0', locked: '0' }));
}

export default function Wallet({ onNavigate }: WalletProps) {
  const t = useTranslations('walletPage');
  // User-side balances only — broker/settlement panel lives at /admin/settlement
  const [rows, setRows] = useState<BalanceRow[]>([]);
  const [balState, setBalState] = useState<'loading' | 'ok' | 'error'>('loading');
  // The server's own reason for a failure (e.g. "not provisioned for wallet
  // access"). Shown verbatim — a generic "backend unreachable" would misdiagnose
  // an auth/provisioning problem as an outage and send people chasing the wrong bug.
  const [balError, setBalError] = useState<string | null>(null);

  const loadUser = async () => {
    setBalState('loading');
    setBalError(null);
    try {
      // Staking (local ledger) and the coin catalogue are fetched alongside the
      // hub balances. Only getNiaBalance() may fail the panel — the others just
      // enrich it, so they degrade to empty rather than hiding real balances.
      const [data, positions, markets, managed] = await Promise.all([
        getNiaBalance(),
        getStakePositions().catch(() => []),
        getNiaMarkets().catch(() => null),
        getManagedCoins().catch(() => []),
      ]);
      const held: BalanceRow[] = [
        ...(Array.isArray(data?.wallets) ? data.wallets : []),
        ...(Array.isArray(data?.tradingBalances) ? data.tradingBalances : []),
        ...(Array.isArray(data) ? data : []),
        ...stakedRows(positions),
      ];
      // Held coins first, then the rest of the catalogue at zero.
      setRows([...held, ...zeroRows(held, supportedSymbols(markets, managed))]);
      setBalState('ok');
    } catch (e) {
      setBalError((e as Error)?.message?.trim() || null);
      setBalState('error');
    }
  };

  useEffect(() => { loadUser(); }, []);

  return (
    <div className="flex-1 min-h-full bg-[#06132a] text-[#d8e2ff] p-4 sm:p-6 lg:p-8 flex flex-col gap-6 overflow-y-auto">

      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center pb-2 border-b border-[#1E3559]/40">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <WalletIcon className="h-7 w-7 text-[#528dff]" />
            {t('title')}
          </h1>
          <p className="text-xs sm:text-sm text-[#8c90a0] mt-1 font-mono">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/25 rounded-lg text-emerald-400 font-semibold text-xs font-mono select-none self-start sm:self-auto">
          <ShieldCheck className="h-4 w-4" /> {t('niaSecured')}
        </div>
      </header>

      {/* Deposit / Withdraw */}
      <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => onNavigate('DEPOSIT_INTERFACE', 'slide_up')}
              className="group p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] hover:border-emerald-400/40 transition-all flex items-center justify-between gap-3 cursor-pointer text-left"
            >
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400"><Download className="h-5 w-5" /></div>
                <div>
                  <div className="text-sm font-bold text-white">{t('depositTitle')}</div>
                  <div className="text-xs text-[#8c90a0]">{t('depositSubtitle')}</div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-[#8c90a0] group-hover:translate-x-0.5 transition-transform" />
            </button>
            <button
              onClick={() => onNavigate('WITHDRAW_INTERFACE', 'slide_up')}
              className="group p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] hover:border-[#528dff]/40 transition-all flex items-center justify-between gap-3 cursor-pointer text-left"
            >
              <div className="flex items-center gap-3">
                <div className="p-3 bg-[#528dff]/10 rounded-xl text-[#528dff]"><Upload className="h-5 w-5" /></div>
                <div>
                  <div className="text-sm font-bold text-white">{t('withdrawTitle')}</div>
                  <div className="text-xs text-[#8c90a0]">{t('withdrawSubtitle')}</div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-[#8c90a0] group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          {/* Staked coin + live earnings (only shows if the user has a stake) */}
          <StakedSummaryCard onOpen={() => onNavigate('STAKING_INTERFACE', 'push')} />

          {/* Balances */}
          <div className="p-6 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-sans font-extrabold text-[#d8e2ff] text-sm uppercase tracking-wider">{t('balances')}</h3>
              <button onClick={loadUser} aria-label={t('refreshBalancesAria')} className="p-2 bg-[#020d24]/60 hover:bg-[#1e3459] border border-[#1E3559] rounded-lg text-[#8c90a0] hover:text-white transition-colors cursor-pointer">
                <RefreshCw className={`h-4 w-4 ${balState === 'loading' ? 'animate-spin' : ''}`} />
              </button>
            </div>
            {balState === 'loading' ? (
              <p className="text-xs font-mono text-[#8c90a0] py-6 text-center">{t('loadingBalances')}</p>
            ) : balState === 'error' ? (
              <p className="text-xs font-mono text-rose-300 py-6 text-center">{balError ?? t('backendUnreachable')}</p>
            ) : rows.length === 0 ? (
              <div className="py-8 text-center flex flex-col items-center gap-3">
                <div className="p-3 bg-[#020d24]/60 rounded-full border border-[#1E3559]"><WalletIcon className="h-6 w-6 text-[#8c90a0]" /></div>
                <p className="text-sm font-bold text-white">{t('noBalances')}</p>
                <p className="text-xs text-[#8c90a0] max-w-xs">{t('noBalancesBody')}</p>
                <button
                  onClick={() => onNavigate('DEPOSIT_INTERFACE', 'slide_up')}
                  className="mt-1 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-bold transition-colors cursor-pointer"
                >
                  <Download className="h-4 w-4" /> {t('depositNow')}
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-2 px-2">
                <table className="w-full min-w-[420px] text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#1E3559]/60 text-[11px] font-mono text-[#8c90a0] uppercase tracking-wider">
                      <th className="pb-3 font-semibold">{t('tableWallet')}</th>
                      <th className="pb-3 font-semibold">{t('tableAsset')}</th>
                      <th className="pb-3 text-right font-semibold">{t('tableAvailable')}</th>
                      <th className="pb-3 text-right font-semibold">{t('tableLocked')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E3559]/40">
                    {rows.map((r, i) => (
                      <tr key={i} className="hover:bg-[#020d24]/40 transition-colors">
                        <td className="py-3.5 font-mono text-xs text-[#afc6ff]">{r.walletType || t('depositWallet')}</td>
                        <td className="py-3.5 font-sans text-sm font-bold text-white">{r.currency}</td>
                        <td className="py-3.5 text-right font-mono text-sm text-white">{r.balance}</td>
                        <td className="py-3.5 text-right font-mono text-xs text-[#8c90a0]">{r.locked ?? '0'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Activity shortcut */}
          <button
            onClick={() => onNavigate('ACTIVITY_HISTORY', 'push')}
            className="p-4 rounded-2xl bg-[#112643]/50 border border-[#1E3559] hover:border-[#528dff]/40 transition-colors flex items-center justify-between gap-3 cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-[#528dff]/10 rounded-xl text-[#528dff]"><ActivityIcon className="h-5 w-5" /></div>
              <div className="text-left">
                <div className="text-sm font-bold text-white">{t('transactionHistory')}</div>
                <div className="text-xs text-[#8c90a0]">{t('transactionHistorySubtitle')}</div>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-[#8c90a0] group-hover:translate-x-0.5 transition-transform" />
          </button>
      </>
    </div>
  );
}
