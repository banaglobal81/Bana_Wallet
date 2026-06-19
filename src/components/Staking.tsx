'use client';

import React, { useState, useEffect } from 'react';
import Decimal from 'decimal.js';
import { useTranslations } from 'next-intl';
import { Screen, SystemSettings } from '../types';
import { getNiaBalance } from '../utils/niaApi';
import {
  Coins,
  TrendingUp,
  Lock,
  ShieldCheck,
  Sparkles,
  Info,
  Clock,
  ChevronRight
} from 'lucide-react';

interface StakingProps {
  settings: SystemSettings;
  onNavigate: (toScreen: Screen, direction: 'push' | 'push_back' | 'slide_up' | 'none') => void;
}

// Staking pools — APY/lock metadata only. There is NO Nia staking-balance endpoint,
// so staked amounts & rewards are real-data-absent (rendered as 0 / empty state),
// and the "amount to stake" max is driven by the user's real WALLET balance.
const STAKING_POOLS = [
  {
    symbol: 'ETH',
    name: 'Ethereum',
    apy: 4.2,
    lockDays: 0,
    accent: 'text-indigo-300',
    ring: 'border-indigo-400/30',
    glyph: 'Ξ',
  },
  {
    symbol: 'LINK',
    name: 'Chainlink',
    apy: 6.8,
    lockDays: 14,
    accent: 'text-sky-300',
    ring: 'border-sky-400/30',
    glyph: 'LK',
  },
  {
    symbol: 'ARB',
    name: 'Arbitrum',
    apy: 9.5,
    lockDays: 30,
    accent: 'text-cyan-300',
    ring: 'border-cyan-400/30',
    glyph: 'AR',
  },
];

// ---------------------------------------------------------------------------
// Balance shape parser (defensive — accepts array OR object with array props).
// Mirrors Dashboard.tsx so per-asset wallet balances are consistent across screens.
// ---------------------------------------------------------------------------
interface RawBalanceRow {
  currency: string;
  balance: string;
  locked: string;
  walletType?: string;
}

function flattenBalanceData(raw: unknown): RawBalanceRow[] {
  if (Array.isArray(raw)) {
    return raw as RawBalanceRow[];
  }
  if (raw !== null && typeof raw === 'object') {
    const rows: RawBalanceRow[] = [];
    for (const val of Object.values(raw as Record<string, unknown>)) {
      if (Array.isArray(val)) {
        rows.push(...(val as RawBalanceRow[]));
      }
    }
    return rows;
  }
  return [];
}

/** Aggregate real wallet balances (balance + locked) per currency, with decimal.js. */
function aggregateBalances(raw: unknown): Map<string, Decimal> {
  const rows = flattenBalanceData(raw);
  const bySymbol = new Map<string, Decimal>();
  for (const row of rows) {
    if (!row.currency) continue;
    const bal = new Decimal(row.balance ?? '0');
    const lkd = new Decimal(row.locked ?? '0');
    const prev = bySymbol.get(row.currency) ?? new Decimal(0);
    bySymbol.set(row.currency, prev.plus(bal).plus(lkd));
  }
  return bySymbol;
}

export default function Staking({ settings, onNavigate }: StakingProps) {
  const t = useTranslations('staking');
  const [selectedPool, setSelectedPool] = useState<string>('ETH');
  const [stakeAmount, setStakeAmount] = useState<string>('');

  // Real per-asset WALLET balances fetched from Nia on mount.
  const [balances, setBalances] = useState<Map<string, Decimal>>(new Map());
  const [balanceLoading, setBalanceLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setBalanceLoading(true);
      let rawData: unknown;
      try {
        rawData = await getNiaBalance();
      } catch {
        rawData = []; // on error treat as empty — never fall back to mock
      }
      if (cancelled) return;
      setBalances(aggregateBalances(rawData));
      setBalanceLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const pool = STAKING_POOLS.find((p) => p.symbol === selectedPool) || STAKING_POOLS[0];

  /** Real wallet balance available to stake for a symbol (0 when none). */
  const getBalance = (symbol: string): Decimal => balances.get(symbol) ?? new Decimal(0);
  const walletBalance = getBalance(pool.symbol);

  // Use decimal.js for the stake amount & reward projection (rule #2). Guard invalid input.
  let amount: Decimal;
  try {
    amount = new Decimal(stakeAmount || 0);
  } catch {
    amount = new Decimal(0);
  }
  const amountIsPositive = amount.gt(0);
  const overBalance = amount.gt(walletBalance);
  const hasNoBalance = !balanceLoading && walletBalance.lte(0);
  const canStake = amountIsPositive && !overBalance && !hasNoBalance;
  // Simple projected yearly reward estimate = amount * APY%
  const projectedYearly = amount.times(new Decimal(pool.apy).div(100));

  // No real staking-balance endpoint exists, so staked/rewards are 0 (empty state),
  // never fabricated. Headline totals therefore read 0 until a real source exists.
  const totalStakedValue = new Decimal(0);
  const totalRewards = new Decimal(0);

  const handleMaxStake = () => setStakeAmount(walletBalance.toFixed());

  return (
    <div className="flex-1 min-h-full bg-[#06132a] text-[#d8e2ff] p-4 sm:p-6 lg:p-8 flex flex-col gap-6 overflow-y-auto">

      {/* Page Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center pb-2 border-b border-[#1E3559]/40">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <Coins className="h-7 w-7 text-[#528dff]" />
            {t('pageTitle')}
          </h1>
          <p className="text-xs sm:text-sm text-[#8c90a0] mt-1 font-mono">
            {t('pageSubtitle')}
          </p>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/25 rounded-lg text-emerald-400 font-semibold text-xs font-mono select-none self-start sm:self-auto">
          <ShieldCheck className="h-4 w-4" /> {t('nonCustodial')}
        </div>
      </header>

      {/* Summary stats */}
      <section className="shrink-0 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-1">
          <span className="text-[11px] font-mono uppercase tracking-widest text-[#8c90a0] font-bold">{t('totalStaked')}</span>
          <span className="text-2xl font-bold font-sans text-white">{totalStakedValue.toString()} <span className="text-sm text-[#8c90a0]">{t('tokens')}</span></span>
        </div>
        <div className="p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-1">
          <span className="text-[11px] font-mono uppercase tracking-widest text-[#8c90a0] font-bold">{t('claimableRewards')}</span>
          <span className="text-2xl font-bold font-sans text-emerald-400 flex items-center gap-2">
            +{totalRewards.toString()}
            <Sparkles className="h-4 w-4 animate-pulse" />
          </span>
        </div>
        <div className="p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-1">
          <span className="text-[11px] font-mono uppercase tracking-widest text-[#8c90a0] font-bold">{t('activePools')}</span>
          <span className="text-2xl font-bold font-sans text-white">{STAKING_POOLS.length}</span>
        </div>
      </section>

      {/* Main grid: pools list + stake panel */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Pools list - 3/5 */}
        <div className="lg:col-span-3 min-w-0 flex flex-col gap-4">
          <div className="p-6 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-4">
            <h3 className="font-sans font-extrabold text-[#d8e2ff] text-sm uppercase tracking-wider">
              {t('availablePools')}
            </h3>

            <div className="flex flex-col gap-3">
              {STAKING_POOLS.map((p) => {
                const isActive = p.symbol === selectedPool;
                return (
                  <button
                    key={p.symbol}
                    onClick={() => setSelectedPool(p.symbol)}
                    className={`text-left p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isActive
                        ? 'bg-[#2E7DFF]/10 border-[#528dff]/50 shadow-[0_0_15px_rgba(46,125,255,0.15)]'
                        : 'bg-[#020d24]/50 border-[#1E3559] hover:border-[#528dff]/30'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-full bg-[#020d24] flex items-center justify-center border ${p.ring} shrink-0`}>
                        <span className={`text-sm font-bold ${p.accent}`}>{p.glyph}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-white text-[15px] truncate">{p.name}</div>
                        <span className="font-mono text-xs text-[#8c90a0]">
                          {balanceLoading
                            ? t('loadingBalance')
                            : t('walletAvailable', { amount: getBalance(p.symbol).toSignificantDigits(8).toString(), symbol: p.symbol })}
                          {p.lockDays > 0 && (
                            <span className="ml-2 inline-flex items-center gap-1 text-[10px]">
                              <Lock className="h-3 w-3" /> {t('lockBadge', { days: p.lockDays })}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="inline-flex items-center gap-1 text-emerald-400 font-bold font-mono text-sm">
                        <TrendingUp className="h-3.5 w-3.5" />
                        {p.apy}%
                      </div>
                      <div className="text-[10px] font-mono text-[#8c90a0] uppercase tracking-wide">{t('apy')}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* What is staking explainer */}
          <div className="p-5 rounded-2xl bg-indigo-500/5 border border-indigo-500/15 flex items-start gap-3">
            <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-400 shrink-0">
              <Info className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">{t('whatIsStakingTitle')}</h4>
              <p className="text-xs text-[#8c90a0] mt-1 leading-relaxed">
                {t('whatIsStakingBody')}
              </p>
            </div>
          </div>
        </div>

        {/* Stake panel - 2/5 */}
        <div className="lg:col-span-2 min-w-0 flex flex-col gap-6">
          <div className="p-6 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-sans font-extrabold text-[#d8e2ff] text-sm uppercase tracking-wider">
                {t('stakeSymbol', { symbol: pool.symbol })}
              </h3>
              <span className="inline-flex items-center gap-1 text-emerald-400 font-bold font-mono text-xs">
                <TrendingUp className="h-3.5 w-3.5" /> {t('apyValue', { apy: pool.apy })}
              </span>
            </div>

            {/* Amount input */}
            <div className="p-4 rounded-xl bg-[#020d24]/80 border border-[#1E3559] flex flex-col gap-2">
              <div className="flex justify-between text-xs font-mono text-[#8c90a0]">
                <span>{t('amountToStake')}</span>
                <span>
                  {balanceLoading
                    ? t('loadingBalance')
                    : t('balance', { amount: walletBalance.toSignificantDigits(8).toString(), asset: pool.symbol })}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <input
                  type="text"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  className="bg-transparent text-xl font-bold font-mono text-white focus:outline-none w-full min-w-0"
                  placeholder="0.00"
                />
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleMaxStake}
                    className="px-2 py-1 bg-[#112643] hover:bg-[#1e3459] border border-[#1E3559] text-[#528dff] rounded text-[10px] font-bold cursor-pointer"
                  >
                    {t('max')}
                  </button>
                  <span className="font-mono text-sm text-[#afc6ff] font-bold">{pool.symbol}</span>
                </div>
              </div>
              {overBalance && !hasNoBalance && (
                <span className="text-[11px] text-rose-400 font-mono">{t('amountExceedsBalance')}</span>
              )}
              {hasNoBalance && (
                <span className="text-[11px] text-amber-400 font-mono">{t('noBalanceHint', { asset: pool.symbol })}</span>
              )}
            </div>

            {/* Projected reward */}
            <div className="flex flex-col gap-2 font-mono text-xs">
              <div className="flex justify-between items-center py-2 border-b border-[#1E3559]/30">
                <span className="text-[#8c90a0] flex items-center gap-1">{t('estYearlyReward')} <Info className="h-3 w-3" /></span>
                <span className="text-emerald-400 font-bold">
                  +{projectedYearly.toNumber().toLocaleString('en-US', { maximumFractionDigits: 4 })} {pool.symbol}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-[#1E3559]/30">
                <span className="text-[#8c90a0] flex items-center gap-1">{t('lockPeriod')}</span>
                <span className="text-white font-bold flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {pool.lockDays === 0 ? t('flexible') : t('lockDays', { days: pool.lockDays })}
                </span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-[#8c90a0]">{t('network')}</span>
                <span className="text-white font-bold">{settings.activeChain}</span>
              </div>
            </div>

            {/* CTA (demo only) */}
            <button
              disabled={!canStake}
              className={`w-full mt-1 py-4 rounded-xl font-sans font-bold text-base text-center transition-all duration-300 border flex items-center justify-center gap-2 cursor-pointer ${
                !canStake
                  ? 'bg-[#112643]/30 border-[#1E3559] text-[#8c90a0]/60 cursor-not-allowed'
                  : 'bg-gradient-to-r from-[#0059c7] to-[#2E7DFF] hover:from-[#2e7dff] hover:to-[#528dff] text-white border-[#528dff]/50 shadow-[0_0_20px_rgba(46,125,255,0.3)] hover:scale-[1.01] active:scale-100'
              }`}
            >
              <Lock className="h-4 w-4" />
              {t('stakeSymbol', { symbol: pool.symbol })}
            </button>
          </div>

          {/* Shortcut to swap to get more tokens */}
          <button
            onClick={() => onNavigate('SWAP_INTERFACE', 'push')}
            className="p-5 rounded-2xl bg-[#112643]/50 border border-[#1E3559] hover:border-[#528dff]/40 transition-colors flex items-center justify-between gap-3 cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-[#528dff]/10 rounded-xl text-[#528dff]">
                <Coins className="h-5 w-5" />
              </div>
              <div className="text-left">
                <div className="text-sm font-bold text-white">{t('needMore', { symbol: pool.symbol })}</div>
                <div className="text-xs text-[#8c90a0]">{t('swapToStakeMore')}</div>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-[#8c90a0] group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

      </div>
    </div>
  );
}
