'use client';

import React, { useState, useEffect } from 'react';
import Decimal from 'decimal.js';
import { useTranslations } from 'next-intl';
import { Screen, Asset, SystemSettings } from '../types';
import { requestNiaWithdrawal, getNiaBalance, getNiaMarkets } from '../utils/niaApi';
import { getManagedCoins } from '../utils/coinsApi';
import { listSavedAddresses, type SavedAddress } from '../utils/accountApi';
import { ShieldCheck, AlertTriangle, ChevronRight, Loader2, BookMarked } from 'lucide-react';
import FlowNav from './wallet/FlowNav';
import Step from './wallet/Step';
import { CoinSelect, NetworkSelect } from './wallet/Selects';

interface RawBalanceRow { currency: string; balance: string; locked: string; walletType?: string }

function flattenBalanceData(raw: unknown): RawBalanceRow[] {
  if (Array.isArray(raw)) return raw as RawBalanceRow[];
  if (raw !== null && typeof raw === 'object') {
    const rows: RawBalanceRow[] = [];
    for (const val of Object.values(raw as Record<string, unknown>)) {
      if (Array.isArray(val)) rows.push(...(val as RawBalanceRow[]));
    }
    return rows;
  }
  return [];
}

/** Aggregate the *available* (withdrawable) balance per currency. Locked funds excluded. */
function aggregateBalances(raw: unknown): Map<string, Decimal> {
  const rows = flattenBalanceData(raw);
  const bySymbol = new Map<string, Decimal>();
  for (const row of rows) {
    if (!row.currency) continue;
    const prev = bySymbol.get(row.currency) ?? new Decimal(0);
    bySymbol.set(row.currency, prev.plus(new Decimal(row.balance ?? '0')));
  }
  return bySymbol;
}

interface WithdrawProps {
  assets: Asset[];
  settings: SystemSettings;
  onNavigate: (toScreen: Screen, direction: 'push' | 'push_back' | 'slide_up' | 'none') => void;
}

interface Wd_Network { code: string; chainType: string; fee: string; min: string }
interface Wd_Currency { symbol: string; networks: Wd_Network[] }

const EVM_CHAINS = new Set(['EVM']);

export default function Withdraw({ onNavigate }: WithdrawProps) {
  const t = useTranslations('withdraw');
  const [currencies, setCurrencies] = useState<Wd_Currency[]>([]);
  const [marketsLoading, setMarketsLoading] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState<string>('');
  const [selectedNetwork, setSelectedNetwork] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [destination, setDestination] = useState<string>('');
  const [stage, setStage] = useState<'form' | 'review' | 'done'>('form');
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [result, setResult] = useState<{ withdrawalId?: string; status?: string } | null>(null);

  const [balances, setBalances] = useState<Map<string, Decimal>>(new Map());
  const [balanceLoading, setBalanceLoading] = useState(true);

  const [savedAddrs, setSavedAddrs] = useState<SavedAddress[]>([]);
  useEffect(() => { listSavedAddresses().then(setSavedAddrs).catch(() => {}); }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBalanceLoading(true);
      let rawData: unknown;
      try { rawData = await getNiaBalance(); } catch { rawData = []; }
      if (cancelled) return;
      setBalances(aggregateBalances(rawData));
      setBalanceLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Load withdraw-enabled currencies/networks (with real fees) from markets.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [data, managed] = await Promise.all([getNiaMarkets(), getManagedCoins()]);
        const list: Wd_Currency[] = (data?.currencies ?? [])
          .map((c: any) => ({
            symbol: c.symbol as string,
            networks: (c.networks ?? [])
              .filter((n: any) => n.withdrawEnabled)
              .map((n: any) => ({
                code: n.networkCode as string,
                chainType: n.chainType as string,
                fee: String(n.withdrawFee ?? '0'),
                min: String(n.minWithdrawAmount ?? '0'),
              })),
          }))
          .filter((c: Wd_Currency) => c.networks.length > 0);
        // Merge admin-added custom coins not already provided by the hub.
        const seen = new Set(list.map((c) => c.symbol.toUpperCase()));
        for (const m of managed) {
          if (seen.has(m.symbol.toUpperCase())) continue;
          list.push({ symbol: m.symbol, networks: m.networks.map((n) => ({ code: n.code, chainType: 'EVM', fee: '0', min: '0' })) });
        }
        if (cancelled) return;
        setCurrencies(list);
      } catch { /* leave empty */ }
      finally { if (!cancelled) setMarketsLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const assetNetworks = currencies.find((c) => c.symbol === selectedAsset)?.networks ?? [];
  const netObj = assetNetworks.find((n) => n.code === selectedNetwork) ?? assetNetworks[0];

  useEffect(() => {
    if (assetNetworks.length && !assetNetworks.some((n) => n.code === selectedNetwork)) {
      setSelectedNetwork(assetNetworks[0].code);
    }
  }, [selectedAsset, currencies]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConfirm = async () => {
    setSubmitting(true);
    setApiError(null);
    try {
      const r = await requestNiaWithdrawal({
        currency: selectedAsset,
        network: selectedNetwork,
        amount: amountDec.toFixed(),
        toAddress: destination.trim(),
      });
      setResult(r || {});
      setStage('done');
    } catch (e: any) {
      setApiError(e?.message || t('withdrawalFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const balance = balances.get(selectedAsset) ?? new Decimal(0);

  let amountDec: Decimal;
  try { amountDec = new Decimal(amount || 0); } catch { amountDec = new Decimal(0); }

  const networkFee = new Decimal(netObj?.fee ?? '0');
  const minAmount = new Decimal(netObj?.min ?? '0');
  const isEvm = EVM_CHAINS.has(netObj?.chainType ?? '');
  const dest = destination.trim();
  const addressLooksValid = isEvm ? /^0x[a-fA-F0-9]{40}$/.test(dest) : dest.length >= 16;
  const amountIsPositive = amountDec.gt(0);
  const totalSend = amountIsPositive ? amountDec.plus(networkFee) : new Decimal(0);
  // The balance must cover the amount PLUS the network fee (fee is charged on top).
  const overBalance = totalSend.gt(balance);
  const belowMin = amountIsPositive && minAmount.gt(0) && amountDec.lt(minAmount);
  const hasNoBalance = !balanceLoading && balance.lte(0);
  const canReview = amountIsPositive && !overBalance && !belowMin && addressLooksValid && !hasNoBalance;
  // Max = the most that can be sent while still leaving room for the fee.
  const handleMax = () => setAmount(Decimal.max(0, balance.minus(networkFee)).toFixed());

  const reviewing = stage === 'review';
  const hasCoin = !!selectedAsset;
  const savedForNet = savedAddrs.filter((a) => a.network === selectedNetwork);

  return (
    <div className="flex-1 min-h-full bg-[#06132a] text-[#d8e2ff] p-4 sm:p-6 lg:p-8 overflow-y-auto">
      <div className="flex items-center justify-end mb-4">
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/25 rounded-lg text-emerald-400 font-semibold text-xs font-mono select-none">
          <ShieldCheck className="h-4 w-4" /> {t('niaSecured')}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-10">
        <FlowNav />

        <div className="flex-1 min-w-0 max-w-3xl">
          {stage === 'done' ? (
            <div className="p-8 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col items-center text-center gap-3">
              <div className="p-4 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"><ShieldCheck className="h-10 w-10" /></div>
              <h3 className="text-xl font-bold text-white">{t('withdrawalRequested')}</h3>
              <p className="text-sm text-[#8c90a0] max-w-sm">
                {t.rich('withdrawalRequestedBody', { amount: amountDec.toNumber(), asset: selectedAsset, b: (c) => <span className="text-white font-bold">{c}</span> })}
              </p>
              {(result?.withdrawalId || result?.status) && (
                <div className="mt-1 flex flex-col items-center gap-1 font-mono text-xs">
                  {result?.withdrawalId && <span className="text-[#8c90a0]">{t('idLabel')} <span className="text-white">{result.withdrawalId}</span></span>}
                  {result?.status && <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">{result.status}</span>}
                </div>
              )}
              <button onClick={() => onNavigate('ACTIVITY_HISTORY', 'push')} className="mt-2 px-5 py-2.5 bg-[#112643] hover:bg-[#1e3459] border border-[#1E3559] text-white rounded-xl text-sm font-bold cursor-pointer flex items-center gap-2">
                {t('viewInHistory')} <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              {/* Step 1 — Select Coin */}
              <Step n={1} title={t('selectCoinTitle')} active>
                {marketsLoading ? (
                  <div className="flex items-center gap-2.5 py-2"><Loader2 className="h-4 w-4 text-[#528dff] animate-spin" /><span className="text-xs font-mono text-[#8c90a0]">{t('loadingBalance')}</span></div>
                ) : (
                  <CoinSelect
                    value={selectedAsset}
                    options={currencies.map((c) => c.symbol)}
                    onChange={setSelectedAsset}
                    placeholder={t('selectCoin')}
                    searchPlaceholder={t('searchCoin')}
                    disabled={reviewing}
                  />
                )}
              </Step>

              {/* Step 2 — Select Network */}
              <Step n={2} title={t('selectNetworkTitle')} active={hasCoin}>
                <NetworkSelect
                  value={selectedNetwork}
                  options={assetNetworks.map((n) => n.code)}
                  onChange={setSelectedNetwork}
                  placeholder={t('selectNetwork')}
                  disabled={!hasCoin || reviewing}
                />
                <p className="text-xs text-[#8c90a0] mt-2 leading-relaxed">{t('networkHint')}</p>
              </Step>

              {/* Step 3 — Amount & Destination */}
              <Step n={3} title={t('amountDestTitle')} active={hasCoin} last>
                {!hasCoin ? (
                  <div className="p-5 rounded-2xl bg-[#0a1b33]/70 border border-[#1E3559] flex items-center gap-2.5 justify-center text-center">
                    <span className="text-sm text-[#56607a]">{t('selectCoinFirst')}</span>
                  </div>
                ) : (
                <div className="flex flex-col gap-4">
                  {/* Amount */}
                  <div className="p-4 rounded-xl bg-[#0a1b33]/70 border border-[#1E3559] flex flex-col gap-2">
                    <div className="flex justify-between text-xs font-mono text-[#8c90a0]">
                      <span>{t('amount')}</span>
                      <span>{balanceLoading ? t('loadingBalance') : t('balance', { amount: balance.toSignificantDigits(8).toString(), asset: selectedAsset })}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <input type="text" value={amount} disabled={reviewing} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="bg-transparent text-xl font-bold font-mono text-white focus:outline-none w-full min-w-0 disabled:opacity-70" />
                      <div className="flex items-center gap-2 shrink-0">
                        {stage === 'form' && <button onClick={handleMax} className="px-2 py-1 bg-[#112643] hover:bg-[#1e3459] border border-[#1E3559] text-[#528dff] rounded text-[10px] font-bold cursor-pointer">{t('max')}</button>}
                        <span className="font-mono text-sm text-[#afc6ff] font-bold">{selectedAsset}</span>
                      </div>
                    </div>
                    {overBalance && <span className="text-[11px] text-rose-400 font-mono">{t('amountExceedsBalance')}</span>}
                    {belowMin && <span className="text-[11px] text-amber-400 font-mono">{t('belowMin', { min: minAmount.toString(), asset: selectedAsset })}</span>}
                    {hasNoBalance && <span className="text-[11px] text-amber-400 font-mono">{t('noBalanceHint', { asset: selectedAsset })}</span>}
                  </div>

                  {/* Destination */}
                  <div className="p-4 rounded-xl bg-[#0a1b33]/70 border border-[#1E3559] flex flex-col gap-2">
                    <span className="text-xs font-mono text-[#8c90a0]">{t('destinationAddress')}</span>
                    {stage === 'form' && savedForNet.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {savedForNet.map((a) => (
                          <button key={a.id} onClick={() => setDestination(a.address)} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#1E3559] bg-[#112643]/60 text-[#afc6ff] hover:bg-[#1e3459] hover:text-white text-[11px] font-mono transition-colors cursor-pointer">
                            <BookMarked className="h-3 w-3" /> {a.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <input type="text" value={destination} disabled={reviewing} onChange={(e) => setDestination(e.target.value)} placeholder={isEvm ? '0x…' : t('addressPlaceholder')} className="bg-transparent text-sm font-mono text-white focus:outline-none w-full min-w-0 disabled:opacity-70 placeholder-[#3d5278]" />
                    {destination.length > 0 && !addressLooksValid && <span className="text-[11px] text-rose-400 font-mono">{t('invalidAddress')}</span>}
                  </div>

                  {/* Summary */}
                  <div className="p-4 rounded-xl bg-[#0a1b33]/70 border border-[#1E3559] flex flex-col gap-1 font-mono text-xs">
                    <div className="flex justify-between items-center py-1.5 border-b border-[#1E3559]/30"><span className="text-[#8c90a0]">{t('networkFee')}</span><span className="text-white font-bold">{networkFee.toString()} {selectedAsset}</span></div>
                    <div className="flex justify-between items-center py-1.5"><span className="text-[#8c90a0]">{t('youWillSend')}</span><span className="text-emerald-400 font-bold">{amountIsPositive ? totalSend.toSignificantDigits(8).toString() : '0'} {selectedAsset}</span></div>
                  </div>

                  {/* Actions */}
                  {stage === 'form' ? (
                    <button onClick={() => setStage('review')} disabled={!canReview} className={`w-full mt-1 py-4 rounded-xl font-sans font-bold text-base text-center transition-all border flex items-center justify-center gap-2 cursor-pointer ${!canReview ? 'bg-[#112643]/30 border-[#1E3559] text-[#8c90a0]/60 cursor-not-allowed' : 'bg-gradient-to-r from-[#0059c7] to-[#2E7DFF] hover:from-[#2e7dff] hover:to-[#528dff] text-white border-[#528dff]/50 shadow-[0_0_20px_rgba(46,125,255,0.3)]'}`}>
                      {t('reviewWithdrawal')}
                    </button>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {apiError && <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs font-mono leading-relaxed">{apiError}</div>}
                      <button onClick={handleConfirm} disabled={submitting} className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-sm rounded-xl border border-emerald-400/40 cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.25)] disabled:opacity-60 disabled:cursor-not-allowed">
                        {submitting ? t('submitting') : t('confirmWithdrawal')}
                      </button>
                      <button onClick={() => { setStage('form'); setApiError(null); }} disabled={submitting} className="w-full py-3 bg-[#020d24]/60 hover:bg-[#112643] text-[#8c90a0] hover:text-white font-bold text-sm rounded-xl border border-[#1E3559]/80 cursor-pointer disabled:opacity-60">
                        {t('edit')}
                      </button>
                    </div>
                  )}

                  <div className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/20 flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-[#8c90a0] leading-relaxed">{t('irreversibleWarning')}</p>
                  </div>
                </div>
                )}
              </Step>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
