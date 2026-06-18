'use client';

import React, { useState } from 'react';
import Decimal from 'decimal.js';
import { Screen, SystemSettings } from '../types';
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

// Mock staking pools — locked positions that earn yield over time.
const STAKING_POOLS = [
  {
    symbol: 'ETH',
    name: 'Ethereum',
    apy: 4.2,
    staked: 2.5,
    rewards: 0.0184,
    lockDays: 0,
    accent: 'text-indigo-300',
    ring: 'border-indigo-400/30',
    glyph: 'Ξ',
  },
  {
    symbol: 'LINK',
    name: 'Chainlink',
    apy: 6.8,
    staked: 120,
    rewards: 1.94,
    lockDays: 14,
    accent: 'text-sky-300',
    ring: 'border-sky-400/30',
    glyph: 'LK',
  },
  {
    symbol: 'ARB',
    name: 'Arbitrum',
    apy: 9.5,
    staked: 600,
    rewards: 12.4,
    lockDays: 30,
    accent: 'text-cyan-300',
    ring: 'border-cyan-400/30',
    glyph: 'AR',
  },
];

export default function Staking({ settings, onNavigate }: StakingProps) {
  const [selectedPool, setSelectedPool] = useState<string>('ETH');
  const [stakeAmount, setStakeAmount] = useState<string>('1.00');

  const pool = STAKING_POOLS.find((p) => p.symbol === selectedPool) || STAKING_POOLS[0];

  // Use decimal.js for the stake amount & reward projection (rule #2). Guard invalid input.
  let amount: Decimal;
  try {
    amount = new Decimal(stakeAmount || 0);
  } catch {
    amount = new Decimal(0);
  }
  const amountIsPositive = amount.gt(0);
  // Simple projected yearly reward estimate = amount * APY%
  const projectedYearly = amount.times(new Decimal(pool.apy).div(100));

  const totalStakedValue = STAKING_POOLS.reduce((sum, p) => sum + p.staked, 0);
  const totalRewards = STAKING_POOLS.reduce((sum, p) => sum + p.rewards, 0);

  return (
    <div className="flex-1 min-h-full bg-[#06132a] text-[#d8e2ff] p-4 sm:p-6 lg:p-8 flex flex-col gap-6 overflow-y-auto">

      {/* Page Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center pb-2 border-b border-[#1E3559]/40">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <Coins className="h-7 w-7 text-[#528dff]" />
            Staking
          </h1>
          <p className="text-xs sm:text-sm text-[#8c90a0] mt-1 font-mono">
            Lock assets to help secure the network and earn passive yield rewards.
          </p>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/25 rounded-lg text-emerald-400 font-semibold text-xs font-mono select-none self-start sm:self-auto">
          <ShieldCheck className="h-4 w-4" /> NON-CUSTODIAL
        </div>
      </header>

      {/* Summary stats */}
      <section className="shrink-0 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-1">
          <span className="text-[11px] font-mono uppercase tracking-widest text-[#8c90a0] font-bold">Total Staked</span>
          <span className="text-2xl font-bold font-sans text-white">{totalStakedValue.toLocaleString('en-US')} <span className="text-sm text-[#8c90a0]">tokens</span></span>
        </div>
        <div className="p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-1">
          <span className="text-[11px] font-mono uppercase tracking-widest text-[#8c90a0] font-bold">Claimable Rewards</span>
          <span className="text-2xl font-bold font-sans text-emerald-400 flex items-center gap-2">
            +{totalRewards.toLocaleString('en-US', { maximumFractionDigits: 3 })}
            <Sparkles className="h-4 w-4 animate-pulse" />
          </span>
        </div>
        <div className="p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-1">
          <span className="text-[11px] font-mono uppercase tracking-widest text-[#8c90a0] font-bold">Active Pools</span>
          <span className="text-2xl font-bold font-sans text-white">{STAKING_POOLS.length}</span>
        </div>
      </section>

      {/* Main grid: pools list + stake panel */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Pools list - 3/5 */}
        <div className="lg:col-span-3 min-w-0 flex flex-col gap-4">
          <div className="p-6 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-4">
            <h3 className="font-sans font-extrabold text-[#d8e2ff] text-sm uppercase tracking-wider">
              Available Staking Pools
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
                          {p.staked.toLocaleString('en-US')} {p.symbol} staked
                          {p.lockDays > 0 && (
                            <span className="ml-2 inline-flex items-center gap-1 text-[10px]">
                              <Lock className="h-3 w-3" /> {p.lockDays}d lock
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
                      <div className="text-[10px] font-mono text-[#8c90a0] uppercase tracking-wide">APY</div>
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
              <h4 className="text-sm font-bold text-white">What is staking?</h4>
              <p className="text-xs text-[#8c90a0] mt-1 leading-relaxed">
                Staking locks your tokens to help validate and secure the blockchain. In return you earn
                rewards (shown as APY — annual percentage yield). Your keys stay self-custodial; assets in a
                lock period can't be moved until the timer ends.
              </p>
            </div>
          </div>
        </div>

        {/* Stake panel - 2/5 */}
        <div className="lg:col-span-2 min-w-0 flex flex-col gap-6">
          <div className="p-6 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-sans font-extrabold text-[#d8e2ff] text-sm uppercase tracking-wider">
                Stake {pool.symbol}
              </h3>
              <span className="inline-flex items-center gap-1 text-emerald-400 font-bold font-mono text-xs">
                <TrendingUp className="h-3.5 w-3.5" /> {pool.apy}% APY
              </span>
            </div>

            {/* Amount input */}
            <div className="p-4 rounded-xl bg-[#020d24]/80 border border-[#1E3559] flex flex-col gap-2">
              <span className="text-xs font-mono text-[#8c90a0]">AMOUNT TO STAKE</span>
              <div className="flex items-center justify-between gap-3">
                <input
                  type="text"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  className="bg-transparent text-xl font-bold font-mono text-white focus:outline-none w-full min-w-0"
                  placeholder="0.00"
                />
                <span className="font-mono text-sm text-[#afc6ff] font-bold shrink-0">{pool.symbol}</span>
              </div>
            </div>

            {/* Projected reward */}
            <div className="flex flex-col gap-2 font-mono text-xs">
              <div className="flex justify-between items-center py-2 border-b border-[#1E3559]/30">
                <span className="text-[#8c90a0] flex items-center gap-1">Est. yearly reward <Info className="h-3 w-3" /></span>
                <span className="text-emerald-400 font-bold">
                  +{projectedYearly.toNumber().toLocaleString('en-US', { maximumFractionDigits: 4 })} {pool.symbol}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-[#1E3559]/30">
                <span className="text-[#8c90a0] flex items-center gap-1">Lock period</span>
                <span className="text-white font-bold flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {pool.lockDays === 0 ? 'Flexible' : `${pool.lockDays} days`}
                </span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-[#8c90a0]">Network</span>
                <span className="text-white font-bold">{settings.activeChain}</span>
              </div>
            </div>

            {/* CTA (demo only) */}
            <button
              disabled={!amountIsPositive}
              className={`w-full mt-1 py-4 rounded-xl font-sans font-bold text-base text-center transition-all duration-300 border flex items-center justify-center gap-2 cursor-pointer ${
                !amountIsPositive
                  ? 'bg-[#112643]/30 border-[#1E3559] text-[#8c90a0]/60 cursor-not-allowed'
                  : 'bg-gradient-to-r from-[#0059c7] to-[#2E7DFF] hover:from-[#2e7dff] hover:to-[#528dff] text-white border-[#528dff]/50 shadow-[0_0_20px_rgba(46,125,255,0.3)] hover:scale-[1.01] active:scale-100'
              }`}
            >
              <Lock className="h-4 w-4" />
              Stake {pool.symbol}
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
                <div className="text-sm font-bold text-white">Need more {pool.symbol}?</div>
                <div className="text-xs text-[#8c90a0]">Swap assets to stake more</div>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-[#8c90a0] group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

      </div>
    </div>
  );
}
