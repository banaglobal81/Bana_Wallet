'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { useTranslations } from 'next-intl';
import { Screen, SystemSettings } from '../types';
import { Coins, Loader2, Lock, Clock, Check, TrendingUp } from 'lucide-react';
import CoinAvatar from './wallet/CoinAvatar';
import {
  getStakingProducts, getStakePositions, stake,
  type StakingProduct, type StakePosition,
} from '../utils/stakingApi';
import { getNiaBalance } from '../utils/niaApi';
import { accruedInterest, msToMaturity, daysElapsed } from '../lib/stakingMath';

interface StakingProps {
  settings: SystemSettings;
  onNavigate: (toScreen: Screen, direction: 'push' | 'push_back' | 'slide_up' | 'none') => void;
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

export default function Staking({ onNavigate: _onNavigate }: StakingProps) {
  const t = useTranslations('staking');
  const [products, setProducts] = useState<StakingProduct[]>([]);
  const [positions, setPositions] = useState<StakePosition[]>([]);
  const [balances, setBalances] = useState<Map<string, Decimal>>(new Map());
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  // Stake flow state
  const [openId, setOpenId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = async () => {
    try {
      const [p, pos, bal] = await Promise.all([
        getStakingProducts(), getStakePositions(), getNiaBalance().catch(() => []),
      ]);
      setProducts(p); setPositions(pos); setBalances(aggregateBalances(bal));
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
      await stake(product.id, new Decimal(amount).toFixed());
      setDone(product.id); setAmount(''); setOpenId(null);
      await load();
      setTimeout(() => setDone(null), 2500);
    } catch (e) { setError((e as Error).message); }
    finally { setSubmitting(false); }
  };

  const STATUS_STYLE: Record<string, string> = {
    ACTIVE: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/25',
    MATURED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
    PAID: 'bg-slate-500/10 text-slate-300 border-slate-500/25',
  };

  return (
    <div className="flex-1 min-h-full bg-[#06132a] text-[#d8e2ff] p-4 sm:p-6 lg:p-8 flex flex-col gap-6 overflow-y-auto">
      <header className="pb-2 border-b border-[#1E3559]/40">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
          <Coins className="h-7 w-7 text-[#528dff]" /> {t('pageTitle')}
        </h1>
        <p className="text-xs sm:text-sm text-[#8c90a0] mt-1 font-mono">{t('pageSubtitle')}</p>
      </header>

      {loading ? (
        <div className="flex items-center gap-2.5 py-10 justify-center"><Loader2 className="h-5 w-5 text-[#528dff] animate-spin" /><span className="text-sm text-[#8c90a0]">{t('loading')}</span></div>
      ) : (
        <>
          {/* Earn — available products */}
          <section className="flex flex-col gap-3">
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
                          <div className="flex gap-2">
                            <button disabled={submitting || amtDec.lte(0) || amtDec.gt(avail)} onClick={() => submitStake(p)}
                              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-sm border border-emerald-400/40 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
                              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} {t('confirmStake')}
                            </button>
                            <button disabled={submitting} onClick={() => { setOpenId(null); setError(null); setAmount(''); }} className="px-4 py-2.5 rounded-xl bg-[#020d24]/60 hover:bg-[#112643] text-[#8c90a0] hover:text-white text-sm font-bold border border-[#1E3559]/80 cursor-pointer">{t('cancel')}</button>
                          </div>
                        </div>
                      ) : (
                        <button disabled={p.full} onClick={() => { setOpenId(p.id); setError(null); setAmount(''); }}
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
            {positions.length === 0 ? (
              <div className="p-6 rounded-2xl bg-[#112643]/70 border border-[#1E3559] text-center text-sm text-[#8c90a0]">{t('noStakes')}</div>
            ) : (
              <div className="flex flex-col gap-3">
                {positions.map((p) => {
                  const liveAccrued = accruedInterest(p.principal, p.dailyRatePct, p.startAt, p.termDays, new Date(now)).toSignificantDigits(8).toString();
                  const elapsed = daysElapsed(p.startAt, new Date(now), p.termDays);
                  const remainingMs = msToMaturity(p.maturityAt, new Date(now));
                  return (
                    <div key={p.id} className="p-4 sm:p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <CoinAvatar symbol={p.coin} size={34} />
                        <div className="min-w-0">
                          <div className="font-bold text-white truncate">{p.principal} {p.coin} <span className="text-[11px] text-[#8c90a0] font-normal">· {p.productName}</span></div>
                          <div className="text-[11px] font-mono text-[#8c90a0]">{t('dayOf', { d: elapsed, total: p.termDays })} · {p.aprPct}% {t('apr')}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-5 shrink-0">
                        <div className="text-right">
                          <div className="text-sm font-bold text-emerald-400 font-mono">+{liveAccrued}</div>
                          <div className="text-[10px] font-mono text-[#8c90a0] uppercase tracking-wide">{t('accrued')}</div>
                        </div>
                        <div className="text-right min-w-[92px]">
                          <div className="text-xs font-mono text-[#d8e2ff] flex items-center gap-1 justify-end"><Clock className="h-3 w-3 text-[#8c90a0]" /> {p.status === 'ACTIVE' ? fmtCountdown(remainingMs) : '—'}</div>
                          <span className={`inline-block mt-1 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[p.status]}`}>{t(`status${p.status}` as 'statusACTIVE')}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <p className="text-[11px] font-mono text-[#8c90a0] px-1">{t('maturedNote')}</p>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
