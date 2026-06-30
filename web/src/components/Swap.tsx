'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { useTranslations } from 'next-intl';
import { Screen, SystemSettings } from '../types';
import { ArrowUpDown, Loader2, Check, ArrowLeftRight, ChevronRight } from 'lucide-react';
import CoinAvatar from './wallet/CoinAvatar';
import { CoinSelect } from './wallet/Selects';
import { getNiaMarkets, getNiaBalance, getNiaPrice, placeNiaOrder } from '../utils/niaApi';

interface SwapProps {
  settings: SystemSettings;
  onNavigate: (toScreen: Screen, direction: 'push' | 'push_back' | 'slide_up' | 'none') => void;
}

interface SpotPair { symbol: string; base: string; quote: string; minQty: string; lotSize: string; takerFeeRate: string }

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

const dpOf = (step: string) => { const i = step.indexOf('.'); return i === -1 ? 0 : step.length - i - 1; };

export default function Swap({ onNavigate }: SwapProps) {
  const t = useTranslations('swap');
  const [pairs, setPairs] = useState<SpotPair[]>([]);
  const [balances, setBalances] = useState<Map<string, Decimal>>(new Map());
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('USDT');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState<Decimal | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [stage, setStage] = useState<'form' | 'review' | 'done'>('form');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ orderId?: string; status?: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [data, bal] = await Promise.all([getNiaMarkets(), getNiaBalance().catch(() => [])]);
        const sp: SpotPair[] = (data?.markets ?? [])
          .filter((m: any) => m.type === 'SPOT')
          .map((m: any) => ({ symbol: m.symbol, base: m.baseAsset, quote: m.quoteAsset, minQty: String(m.minQty ?? '0'), lotSize: String(m.lotSize ?? '0.00000001'), takerFeeRate: String(m.takerFeeRate ?? '0') }));
        setPairs(sp);
        setBalances(aggregateBalances(bal));
        // default "to" = first base asset that isn't the default from
        const firstBase = sp.find((p) => p.base !== 'USDT')?.base ?? '';
        setTo((prev) => prev || firstBase);
      } catch { /* empty state */ }
      finally { setLoading(false); }
    })();
  }, []);

  // Tradeable coins (union of base + quote across SPOT pairs).
  const coins = useMemo(() => Array.from(new Set(pairs.flatMap((p) => [p.base, p.quote]))).sort(), [pairs]);

  // Resolve the market + side for the chosen from→to.
  const route = useMemo(() => {
    if (!from || !to || from === to) return null;
    const pair = pairs.find((p) => (p.base === from && p.quote === to) || (p.base === to && p.quote === from));
    if (!pair) return null;
    return { pair, side: (pair.base === to ? 'BUY' : 'SELL') as 'BUY' | 'SELL' };
  }, [from, to, pairs]);

  // Fetch the live price whenever the route changes.
  useEffect(() => {
    if (!route) { setPrice(null); return; }
    let cancelled = false;
    setPriceLoading(true); setPrice(null);
    getNiaPrice(route.pair.symbol).then((p) => { if (!cancelled) setPrice(p ? new Decimal(p.price) : null); })
      .finally(() => { if (!cancelled) setPriceLoading(false); });
    return () => { cancelled = true; };
  }, [route]);

  const fromBal = balances.get(from) ?? new Decimal(0);
  let amtDec: Decimal; try { amtDec = new Decimal(amount || 0); } catch { amtDec = new Decimal(0); }
  const fee = route ? new Decimal(route.pair.takerFeeRate) : new Decimal(0);

  // Order quantity (base asset) + estimated receive (to asset).
  const calc = useMemo(() => {
    if (!route || !price || price.lte(0) || amtDec.lte(0)) return null;
    const dp = dpOf(route.pair.lotSize);
    let quantity: Decimal, receive: Decimal;
    if (route.side === 'SELL') {              // from = base → sell base for quote
      quantity = amtDec.toDecimalPlaces(dp, Decimal.ROUND_DOWN);
      receive = quantity.times(price).times(new Decimal(1).minus(fee));
    } else {                                  // BUY: from = quote → buy base with quote
      quantity = amtDec.div(price).toDecimalPlaces(dp, Decimal.ROUND_DOWN);
      receive = quantity.times(new Decimal(1).minus(fee));
    }
    return { quantity, receive };
  }, [route, price, amtDec, fee]);

  const minQty = route ? new Decimal(route.pair.minQty) : new Decimal(0);
  const overBalance = amtDec.gt(fromBal);
  const belowMin = calc != null && calc.quantity.lt(minQty);
  const canReview = !!route && !!calc && amtDec.gt(0) && !overBalance && !belowMin;

  const flip = () => { setFrom(to); setTo(from); setAmount(''); setError(null); };
  const setMax = () => setAmount(fromBal.toFixed());

  const confirm = async () => {
    if (!route || !calc) return;
    setSubmitting(true); setError(null);
    try {
      const r = await placeNiaOrder({
        symbol: route.pair.symbol.replace(/^SPOT:/, ''),
        side: route.side,
        type: 'MARKET',
        quantity: calc.quantity.toFixed(),
        price: price ? price.toFixed() : undefined,
      });
      setResult({ orderId: r?.orderId, status: r?.status });
      setStage('done');
    } catch (e) { setError((e as Error).message); }
    finally { setSubmitting(false); }
  };

  const reviewing = stage === 'review';

  return (
    <div className="flex-1 min-h-full bg-[#06132a] text-[#d8e2ff] p-4 sm:p-6 lg:p-8 flex flex-col gap-6 overflow-y-auto">
      <header className="pb-2 border-b border-[#1E3559]/40">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
          <ArrowLeftRight className="h-7 w-7 text-[#528dff]" /> {t('pageTitle')}
        </h1>
        <p className="text-xs sm:text-sm text-[#8c90a0] mt-1 font-mono">{t('pageSubtitle')}</p>
      </header>

      {loading ? (
        <div className="flex items-center gap-2.5 py-10 justify-center"><Loader2 className="h-5 w-5 text-[#528dff] animate-spin" /><span className="text-sm text-[#8c90a0]">{t('loading')}</span></div>
      ) : stage === 'done' ? (
        <div className="max-w-lg mx-auto w-full p-8 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col items-center text-center gap-3">
          <div className="p-4 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"><Check className="h-10 w-10" /></div>
          <h3 className="text-xl font-bold text-white">{t('swapDone')}</h3>
          <p className="text-sm text-[#8c90a0] max-w-sm">{t('swapDoneBody', { from, to })}</p>
          {(result?.orderId || result?.status) && (
            <div className="mt-1 flex flex-col items-center gap-1 font-mono text-xs">
              {result?.orderId && <span className="text-[#8c90a0]">{t('orderId')} <span className="text-white">{result.orderId}</span></span>}
              {result?.status && <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">{result.status}</span>}
            </div>
          )}
          <div className="flex gap-2 mt-2">
            <button onClick={() => { setStage('form'); setAmount(''); setResult(null); }} className="px-5 py-2.5 bg-[#112643] hover:bg-[#1e3459] border border-[#1E3559] text-white rounded-xl text-sm font-bold cursor-pointer">{t('newSwap')}</button>
            <button onClick={() => onNavigate('ACTIVITY_HISTORY', 'push')} className="px-5 py-2.5 bg-[#020d24]/60 hover:bg-[#112643] border border-[#1E3559] text-[#8c90a0] hover:text-white rounded-xl text-sm font-bold cursor-pointer flex items-center gap-1.5">{t('viewInHistory')} <ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      ) : (
        <div className="max-w-lg mx-auto w-full flex flex-col gap-3">
          {/* From */}
          <div className="p-4 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-2">
            <div className="flex justify-between text-[11px] font-mono text-[#8c90a0]">
              <span>{t('youPay')}</span>
              <span>{t('balance')}: {fromBal.toSignificantDigits(8).toString()} {from}</span>
            </div>
            <div className="flex items-center gap-3">
              <input value={amount} disabled={reviewing} onChange={(e) => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v); }} placeholder="0.00" inputMode="decimal" className="bg-transparent text-2xl font-bold font-mono text-white focus:outline-none w-full min-w-0 disabled:opacity-70" />
              <div className="shrink-0 w-[150px]"><CoinSelect value={from} options={coins} onChange={(c) => { if (c === to) setTo(from); setFrom(c); setAmount(''); }} placeholder={t('coin')} searchPlaceholder={t('searchCoin')} disabled={reviewing} /></div>
            </div>
            {stage === 'form' && <button onClick={setMax} className="self-start px-2 py-1 bg-[#020d24]/60 hover:bg-[#1e3459] border border-[#1E3559] text-[#528dff] rounded text-[10px] font-bold cursor-pointer">{t('max')}</button>}
            {overBalance && <span className="text-[11px] text-rose-400 font-mono">{t('insufficient', { coin: from })}</span>}
          </div>

          {/* Flip */}
          <div className="flex justify-center -my-5 z-10">
            <button onClick={flip} disabled={reviewing} className="p-2 rounded-xl bg-[#0a1b33] border border-[#1E3559] hover:border-[#528dff]/50 text-[#528dff] cursor-pointer disabled:opacity-50 transition-colors"><ArrowUpDown className="h-4 w-4" /></button>
          </div>

          {/* To */}
          <div className="p-4 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-2">
            <span className="text-[11px] font-mono text-[#8c90a0]">{t('youReceive')} ({t('estimated')})</span>
            <div className="flex items-center gap-3">
              <div className="text-2xl font-bold font-mono text-white w-full min-w-0 truncate">{calc ? calc.receive.toSignificantDigits(8).toString() : '0.00'}</div>
              <div className="shrink-0 w-[150px]"><CoinSelect value={to} options={coins} onChange={(c) => { if (c === from) setFrom(to); setTo(c); }} placeholder={t('coin')} searchPlaceholder={t('searchCoin')} disabled={reviewing} /></div>
            </div>
          </div>

          {/* Rate / fee / route info */}
          <div className="px-1 flex flex-col gap-1 text-[11px] font-mono text-[#8c90a0]">
            {!route && from && to && from !== to && <span className="text-amber-400">{t('noRoute')}</span>}
            {route && (
              <>
                <div className="flex justify-between"><span>{t('rate')}</span><span className="text-[#d8e2ff]">{priceLoading ? '…' : price ? `1 ${route.pair.base} ≈ ${price.toSignificantDigits(8).toString()} ${route.pair.quote}` : '—'}</span></div>
                <div className="flex justify-between"><span>{t('fee')}</span><span className="text-[#d8e2ff]">{fee.times(100).toString()}%</span></div>
                {belowMin && <span className="text-amber-400">{t('belowMin', { min: route.pair.minQty, coin: route.pair.base })}</span>}
              </>
            )}
          </div>

          {error && <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs font-mono">{error}</div>}

          {/* Actions */}
          {stage === 'form' ? (
            <button onClick={() => setStage('review')} disabled={!canReview} className={`w-full mt-1 py-4 rounded-xl font-bold text-base border flex items-center justify-center gap-2 cursor-pointer ${!canReview ? 'bg-[#112643]/30 border-[#1E3559] text-[#8c90a0]/60 cursor-not-allowed' : 'bg-gradient-to-r from-[#0059c7] to-[#2E7DFF] hover:from-[#2e7dff] hover:to-[#528dff] text-white border-[#528dff]/50 shadow-[0_0_20px_rgba(46,125,255,0.3)]'}`}>{t('reviewSwap')}</button>
          ) : (
            <div className="flex flex-col gap-2.5">
              <div className="p-4 rounded-xl bg-[#0a1b33]/70 border border-[#1E3559] flex flex-col gap-1.5 font-mono text-xs">
                <div className="flex justify-between"><span className="text-[#8c90a0]">{t('youPay')}</span><span className="text-white font-bold">{amtDec.toSignificantDigits(8).toString()} {from}</span></div>
                <div className="flex justify-between"><span className="text-[#8c90a0]">{t('youReceive')} ({t('estimated')})</span><span className="text-emerald-400 font-bold">{calc ? calc.receive.toSignificantDigits(8).toString() : '0'} {to}</span></div>
              </div>
              <button onClick={confirm} disabled={submitting} className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-sm rounded-xl border border-emerald-400/40 cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {t('confirmSwap')}</button>
              <button onClick={() => { setStage('form'); setError(null); }} disabled={submitting} className="w-full py-3 bg-[#020d24]/60 hover:bg-[#112643] text-[#8c90a0] hover:text-white font-bold text-sm rounded-xl border border-[#1E3559]/80 cursor-pointer disabled:opacity-60">{t('edit')}</button>
            </div>
          )}

          <p className="text-[11px] font-mono text-[#8c90a0] text-center mt-1">{t('marketNote')}</p>
        </div>
      )}
    </div>
  );
}
