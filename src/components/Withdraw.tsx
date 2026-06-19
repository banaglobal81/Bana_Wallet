'use client';

import React, { useState, useEffect } from 'react';
import Decimal from 'decimal.js';
import { useTranslations } from 'next-intl';
import { Screen, Asset, SystemSettings } from '../types';
import { requestNiaWithdrawal, getNiaBalance } from '../utils/niaApi';

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
import {
  ArrowLeft,
  Upload,
  ShieldCheck,
  AlertTriangle,
  Wallet,
  ChevronRight
} from 'lucide-react';

interface WithdrawProps {
  assets: Asset[];
  settings: SystemSettings;
  onNavigate: (toScreen: Screen, direction: 'push' | 'push_back' | 'slide_up' | 'none') => void;
}

export default function Withdraw({ assets, settings, onNavigate }: WithdrawProps) {
  const t = useTranslations('withdraw');
  const [selectedAsset, setSelectedAsset] = useState<string>('ETH');
  const [amount, setAmount] = useState<string>('');
  const [destination, setDestination] = useState<string>('');
  const [stage, setStage] = useState<'form' | 'review' | 'done'>('form');
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [result, setResult] = useState<{ withdrawalId?: string; status?: string } | null>(null);

  // Real per-asset available balances fetched from Nia on mount.
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

  // Submit a real withdrawal to Nia-Hub via the backend.
  const handleConfirm = async () => {
    setSubmitting(true);
    setApiError(null);
    try {
      const r = await requestNiaWithdrawal({
        currency: selectedAsset,
        network: 'EVM',
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

  const networkFee = new Decimal('0.0008'); // mock; comes from Nia in the real call
  const addressLooksValid = /^0x[a-fA-F0-9]{40}$/.test(destination.trim());
  const amountIsPositive = amountDec.gt(0);
  const overBalance = amountDec.gt(balance);
  const hasNoBalance = !balanceLoading && balance.lte(0);
  const canReview =
    amountIsPositive && !overBalance && addressLooksValid && !hasNoBalance;
  // BUG #9: only fold the network fee into the "you will send" total once a real
  // positive amount is entered. At amount 0 the total must read 0, not the fee.
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

                {/* Asset selector */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {assets.map((a) => (
                    <button
                      key={a.id}
                      disabled={stage === 'review'}
                      onClick={() => setSelectedAsset(a.symbol)}
                      className={`py-2.5 px-3 rounded-xl border text-sm font-bold font-mono transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        selectedAsset === a.symbol
                          ? 'bg-[#2E7DFF]/10 border-[#528dff]/50 text-white'
                          : 'bg-[#020d24]/50 border-[#1E3559] text-[#8c90a0] hover:text-white'
                      }`}
                    >
                      {a.symbol}
                    </button>
                  ))}
                </div>

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
                  {hasNoBalance && (
                    <span className="text-[11px] text-amber-400 font-mono">{t('noBalanceHint', { asset: selectedAsset })}</span>
                  )}
                </div>

                {/* Destination */}
                <div className="p-4 rounded-xl bg-[#020d24]/80 border border-[#1E3559] flex flex-col gap-2">
                  <span className="text-xs font-mono text-[#8c90a0]">{t('destinationAddress')}</span>
                  <input
                    type="text"
                    value={destination}
                    disabled={stage === 'review'}
                    onChange={(e) => setDestination(e.target.value)}
                    className="bg-transparent text-sm font-mono text-white focus:outline-none w-full min-w-0 disabled:opacity-70 placeholder-[#3d5278]"
                    placeholder="0x..."
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
