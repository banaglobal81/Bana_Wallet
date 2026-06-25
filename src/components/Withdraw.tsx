'use client';

import React, { useState, useEffect } from 'react';
import Decimal from 'decimal.js';
import { useTranslations } from 'next-intl';
import { Screen, Asset, SystemSettings } from '../types';
import { requestNiaWithdrawal, getNiaBalance, getNiaMarkets } from '../utils/niaApi';
import { listSavedAddresses, type SavedAddress } from '../utils/accountApi';

// ---------------------------------------------------------------------------
// Balance shape parser (defensive — accepts array OR object with array props).
// Mirrors Dashboard.tsx so per-asset available balance is consistent across screens.
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

/**
 * Aggregate the *available* (withdrawable) balance per currency with decimal.js.
 * Only the free `balance` counts — `locked` funds are reserved (e.g. in orders /
 * pending) and cannot be withdrawn, so they are excluded.
 */
function aggregateBalances(raw: unknown): Map<string, Decimal> {
  const rows = flattenBalanceData(raw);
  const bySymbol = new Map<string, Decimal>();
  for (const row of rows) {
    if (!row.currency) continue;
    const bal = new Decimal(row.balance ?? '0'); // available only — exclude locked
    const prev = bySymbol.get(row.currency) ?? new Decimal(0);
    bySymbol.set(row.currency, prev.plus(bal));
  }
  return bySymbol;
}
import {
  ArrowLeft,
  Upload,
  ShieldCheck,
  AlertTriangle,
  Wallet,
  ChevronRight,
  Loader2,
  BookMarked
} from 'lucide-react';

interface WithdrawProps {
  assets: Asset[];
  settings: SystemSettings;
  onNavigate: (toScreen: Screen, direction: 'push' | 'push_back' | 'slide_up' | 'none') => void;
}

// Withdraw-enabled currency/network, sourced live from Nia-Hub markets — so the
// asset list, networks, and fees are all real (no hardcoded values).
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

  // Real per-asset available balances fetched from Nia on mount.
  const [balances, setBalances] = useState<Map<string, Decimal>>(new Map());
  const [balanceLoading, setBalanceLoading] = useState(true);

  // Saved withdrawal addresses (address book) for quick-pick.
  const [savedAddrs, setSavedAddrs] = useState<SavedAddress[]>([]);
  useEffect(() => { listSavedAddresses().then(setSavedAddrs).catch(() => {}); }, []);

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

  // Load withdraw-enabled currencies/networks (with real fees) from markets.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getNiaMarkets();
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
        if (cancelled) return;
        setCurrencies(list);
        if (list.length) {
          setSelectedAsset(list[0].symbol);
          setSelectedNetwork(list[0].networks[0].code);
        }
      } catch { /* leave empty — UI shows no assets */ }
      finally { if (!cancelled) setMarketsLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const assetNetworks = currencies.find((c) => c.symbol === selectedAsset)?.networks ?? [];
  const netObj = assetNetworks.find((n) => n.code === selectedNetwork) ?? assetNetworks[0];

  // Keep the selected network valid when the asset changes.
  useEffect(() => {
    if (assetNetworks.length && !assetNetworks.some((n) => n.code === selectedNetwork)) {
      setSelectedNetwork(assetNetworks[0].code);
    }
  }, [selectedAsset, currencies]); // eslint-disable-line react-hooks/exhaustive-deps

  // Submit a real withdrawal to Nia-Hub via the backend (held for admin approval).
  const handleConfirm = async () => {
    setSubmitting(true);
    setApiError(null);
    try {
      const r = await requestNiaWithdrawal({
        currency: selectedAsset,
        network: selectedNetwork, // real network code from markets
        amount: amountDec.toFixed(), // canonical decimal string, no float drift
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

  // Real available balance for the selected asset (Decimal). 0 when none / not loaded.
  const balance = balances.get(selectedAsset) ?? new Decimal(0);

  // Parse the amount once with decimal.js (rule #2). Decimal throws on non-numeric
  // input, so fall back to 0 when the field is empty/invalid.
  let amountDec: Decimal;
  try {
    amountDec = new Decimal(amount || 0);
  } catch {
    amountDec = new Decimal(0);
  }

  // Real network fee + minimum from the hub's markets config.
  const networkFee = new Decimal(netObj?.fee ?? '0');
  const minAmount = new Decimal(netObj?.min ?? '0');
  const isEvm = EVM_CHAINS.has(netObj?.chainType ?? '');
  // Address validation is network-aware: strict 0x… for EVM, non-empty otherwise.
  const dest = destination.trim();
  const addressLooksValid = isEvm ? /^0x[a-fA-F0-9]{40}$/.test(dest) : dest.length >= 16;
  const amountIsPositive = amountDec.gt(0);
  const overBalance = amountDec.gt(balance);
  const belowMin = amountIsPositive && minAmount.gt(0) && amountDec.lt(minAmount);
  const hasNoBalance = !balanceLoading && balance.lte(0);
  const canReview =
    amountIsPositive && !overBalance && !belowMin && addressLooksValid && !hasNoBalance;
  // Only fold the network fee into the "you will send" total once a real positive
  // amount is entered. At amount 0 the total must read 0, not the fee.
  const totalSend = amountIsPositive ? amountDec.plus(networkFee) : new Decimal(0);

  const handleMax = () => setAmount(balance.toFixed());

  return (
    <div className="flex-1 min-h-full bg-[#06132a] text-[#d8e2ff] p-4 sm:p-6 lg:p-8 flex flex-col gap-6 overflow-y-auto">

      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center pb-2 border-b border-[#1E3559]/40">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('WALLET_INTERFACE', 'push_back')}
            aria-label={t('backAria')}
            className="p-2 rounded-xl border border-[#1E3559] bg-[#112643]/50 hover:bg-[#1e3459] text-[#8c90a0] hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
              <Upload className="h-6 w-6 text-[#528dff]" />
              {t('pageTitle')}
            </h1>
            <p className="text-xs sm:text-sm text-[#8c90a0] mt-1 font-mono">
              {t('pageSubtitle')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/25 rounded-lg text-emerald-400 font-semibold text-xs font-mono select-none self-start sm:self-auto">
          <ShieldCheck className="h-4 w-4" /> {t('niaSecured')}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Left form - 3/5 */}
        <div className="lg:col-span-3 min-w-0 flex flex-col gap-5">
          <div className="p-6 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-4">

            {stage === 'done' ? (
              /* Success state */
              <div className="flex flex-col items-center text-center gap-3 py-6">
                <div className="p-4 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  <ShieldCheck className="h-10 w-10" />
                </div>
                <h3 className="text-xl font-bold text-white">{t('withdrawalRequested')}</h3>
                <p className="text-sm text-[#8c90a0] max-w-sm">
                  {t.rich('withdrawalRequestedBody', {
                    amount: amountDec.toNumber(),
                    asset: selectedAsset,
                    b: (chunks) => <span className="text-white font-bold">{chunks}</span>,
                  })}
                </p>
                {(result?.withdrawalId || result?.status) && (
                  <div className="mt-1 flex flex-col items-center gap-1 font-mono text-xs">
                    {result?.withdrawalId && (
                      <span className="text-[#8c90a0]">{t('idLabel')} <span className="text-white">{result.withdrawalId}</span></span>
                    )}
                    {result?.status && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">
                        {result.status}
                      </span>
                    )}
                  </div>
                )}
                <button
                  onClick={() => onNavigate('ACTIVITY_HISTORY', 'push')}
                  className="mt-2 px-5 py-2.5 bg-[#112643] hover:bg-[#1e3459] border border-[#1E3559] text-white rounded-xl text-sm font-bold cursor-pointer flex items-center gap-2"
                >
                  {t('viewInHistory')} <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <h3 className="font-sans font-extrabold text-[#d8e2ff] text-sm uppercase tracking-wider">
                  {stage === 'review' ? t('reviewTitle') : t('detailsTitle')}
                </h3>

                {/* Asset selector — withdraw-enabled assets, live from Nia-Hub markets */}
                {marketsLoading ? (
                  <div className="flex items-center gap-2.5 py-2">
                    <Loader2 className="h-4 w-4 text-[#528dff] shrink-0 animate-spin" />
                    <p className="text-xs font-mono text-[#8c90a0]">{t('loadingBalance')}</p>
                  </div>
                ) : currencies.length === 0 ? (
                  <p className="text-xs font-mono text-[#8c90a0] py-2">{t('noBalanceHint', { asset: '' })}</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-h-44 overflow-y-auto pr-1">
                    {currencies.map((c) => (
                      <button
                        key={c.symbol}
                        disabled={stage === 'review'}
                        onClick={() => setSelectedAsset(c.symbol)}
                        className={`py-2.5 px-3 rounded-xl border text-sm font-bold font-mono transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                          selectedAsset === c.symbol
                            ? 'bg-[#2E7DFF]/10 border-[#528dff]/50 text-white'
                            : 'bg-[#020d24]/50 border-[#1E3559] text-[#8c90a0] hover:text-white'
                        }`}
                      >
                        {c.symbol}
                      </button>
                    ))}
                  </div>
                )}

                {/* Network selector (shown when the asset supports more than one) */}
                {assetNetworks.length > 1 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-mono text-[#8c90a0] uppercase tracking-wider">{t('networkLabel')}</span>
                    <div className="flex flex-wrap gap-2.5">
                      {assetNetworks.map((n) => (
                        <button
                          key={n.code}
                          disabled={stage === 'review'}
                          onClick={() => setSelectedNetwork(n.code)}
                          className={`py-2 px-4 rounded-xl border text-xs font-bold font-mono transition-all cursor-pointer disabled:opacity-50 ${
                            selectedNetwork === n.code
                              ? 'bg-[#2E7DFF]/10 border-[#528dff]/50 text-white'
                              : 'bg-[#020d24]/50 border-[#1E3559] text-[#8c90a0] hover:text-white'
                          }`}
                        >
                          {n.code}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Amount */}
                <div className="p-4 rounded-xl bg-[#020d24]/80 border border-[#1E3559] flex flex-col gap-2">
                  <div className="flex justify-between text-xs font-mono text-[#8c90a0]">
                    <span>{t('amount')}</span>
                    <span>
                      {balanceLoading
                        ? t('loadingBalance')
                        : t('balance', { amount: balance.toSignificantDigits(8).toString(), asset: selectedAsset })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <input
                      type="text"
                      value={amount}
                      disabled={stage === 'review'}
                      onChange={(e) => setAmount(e.target.value)}
                      className="bg-transparent text-xl font-bold font-mono text-white focus:outline-none w-full min-w-0 disabled:opacity-70"
                      placeholder="0.00"
                    />
                    <div className="flex items-center gap-2 shrink-0">
                      {stage === 'form' && (
                        <button
                          onClick={handleMax}
                          className="px-2 py-1 bg-[#112643] hover:bg-[#1e3459] border border-[#1E3559] text-[#528dff] rounded text-[10px] font-bold cursor-pointer"
                        >
                          {t('max')}
                        </button>
                      )}
                      <span className="font-mono text-sm text-[#afc6ff] font-bold">{selectedAsset}</span>
                    </div>
                  </div>
                  {overBalance && (
                    <span className="text-[11px] text-rose-400 font-mono">{t('amountExceedsBalance')}</span>
                  )}
                  {belowMin && (
                    <span className="text-[11px] text-amber-400 font-mono">{t('belowMin', { min: minAmount.toString(), asset: selectedAsset })}</span>
                  )}
                  {hasNoBalance && (
                    <span className="text-[11px] text-amber-400 font-mono">{t('noBalanceHint', { asset: selectedAsset })}</span>
                  )}
                </div>

                {/* Destination */}
                <div className="p-4 rounded-xl bg-[#020d24]/80 border border-[#1E3559] flex flex-col gap-2">
                  <span className="text-xs font-mono text-[#8c90a0]">{t('destinationAddress')}</span>

                  {/* Saved addresses (address book) matching this network */}
                  {stage === 'form' && savedAddrs.filter((a) => a.network === selectedNetwork).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {savedAddrs.filter((a) => a.network === selectedNetwork).map((a) => (
                        <button
                          key={a.id}
                          onClick={() => setDestination(a.address)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#1E3559] bg-[#112643]/60 text-[#afc6ff] hover:bg-[#1e3459] hover:text-white text-[11px] font-mono transition-colors cursor-pointer"
                        >
                          <BookMarked className="h-3 w-3" /> {a.label}
                        </button>
                      ))}
                    </div>
                  )}

                  <input
                    type="text"
                    value={destination}
                    disabled={stage === 'review'}
                    onChange={(e) => setDestination(e.target.value)}
                    className="bg-transparent text-sm font-mono text-white focus:outline-none w-full min-w-0 disabled:opacity-70 placeholder-[#3d5278]"
                    placeholder={isEvm ? '0x…' : t('addressPlaceholder')}
                  />
                  {destination.length > 0 && !addressLooksValid && (
                    <span className="text-[11px] text-rose-400 font-mono">{t('invalidAddress')}</span>
                  )}
                </div>

                {/* Actions */}
                {stage === 'form' ? (
                  <button
                    onClick={() => setStage('review')}
                    disabled={!canReview}
                    className={`w-full mt-1 py-4 rounded-xl font-sans font-bold text-base text-center transition-all border flex items-center justify-center gap-2 cursor-pointer ${
                      !canReview
                        ? 'bg-[#112643]/30 border-[#1E3559] text-[#8c90a0]/60 cursor-not-allowed'
                        : 'bg-gradient-to-r from-[#0059c7] to-[#2E7DFF] hover:from-[#2e7dff] hover:to-[#528dff] text-white border-[#528dff]/50 shadow-[0_0_20px_rgba(46,125,255,0.3)]'
                    }`}
                  >
                    {t('reviewWithdrawal')}
                  </button>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {apiError && (
                      <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs font-mono leading-relaxed">
                        {apiError}
                      </div>
                    )}
                    <button
                      onClick={handleConfirm}
                      disabled={submitting}
                      className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-sm rounded-xl border border-emerald-400/40 cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.25)] disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {submitting ? t('submitting') : t('confirmWithdrawal')}
                    </button>
                    <button
                      onClick={() => { setStage('form'); setApiError(null); }}
                      disabled={submitting}
                      className="w-full py-3 bg-[#020d24]/60 hover:bg-[#112643] text-[#8c90a0] hover:text-white font-bold text-sm rounded-xl border border-[#1E3559]/80 cursor-pointer disabled:opacity-60"
                    >
                      {t('edit')}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right summary - 2/5 */}
        <div className="lg:col-span-2 min-w-0 flex flex-col gap-6">
          <div className="p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-4 font-mono text-xs">
            <h3 className="font-sans font-extrabold text-[#d8e2ff] text-xs uppercase tracking-wider mb-1">
              {t('transactionSummary')}
            </h3>
            <div className="flex justify-between items-center py-2 border-b border-[#1E3559]/30">
              <span className="text-[#8c90a0]">{t('asset')}</span>
              <span className="text-white font-bold">{selectedAsset}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[#1E3559]/30">
              <span className="text-[#8c90a0]">{t('amountLabel')}</span>
              <span className="text-white font-bold">
                {amountIsPositive ? amountDec.toSignificantDigits(8).toString() : '0'} {selectedAsset}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[#1E3559]/30">
              <span className="text-[#8c90a0]">{t('networkFee')}</span>
              <span className="text-white font-bold">{networkFee.toString()} {selectedAsset}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-[#8c90a0]">{t('youWillSend')}</span>
              <span className="text-emerald-400 font-bold">
                {amountIsPositive ? totalSend.toSignificantDigits(8).toString() : '0'} {selectedAsset}
              </span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-[#8c90a0] leading-relaxed">
              {t('irreversibleWarning')}
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
