'use client';

import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslations } from 'next-intl';
import { Screen, Asset, SystemSettings } from '../types';
import { getNiaDeposits, createDepositAddress, getNiaMarkets } from '../utils/niaApi';
import { copyToClipboard } from '../utils/clipboard';
import {
  ArrowLeft,
  QrCode,
  ShieldCheck,
  AlertTriangle,
  Download,
  Info,
  Copy,
  Check,
  Loader2,
  Search
} from 'lucide-react';

interface DepositProps {
  assets: Asset[];
  settings: SystemSettings;
  onNavigate: (toScreen: Screen, direction: 'push' | 'push_back' | 'slide_up' | 'none') => void;
}

// A deposit-enabled (currency, network) catalogue entry, derived live from
// /api/nia/markets — so the asset chips and network codes always match what the
// tenant actually supports (e.g. ETH / TRX / BASE / SOL — NOT guessed ERC20/TRC20).
interface CurrencyOption {
  symbol: string;
  networks: { code: string; chainType?: string }[];
}

export default function Deposit({ onNavigate }: DepositProps) {
  const t = useTranslations('deposit');

  // Supported deposit currencies/networks, loaded from Nia-Hub markets.
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([]);
  const [marketsLoading, setMarketsLoading] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState<string>('');
  const [selectedNetwork, setSelectedNetwork] = useState<string>('');
  const [assetQuery, setAssetQuery] = useState('');

  // Deposit address state for the selected asset + network.
  const [address, setAddress] = useState<string>('');
  const [memo, setMemo] = useState<string>('');
  const [addrLoading, setAddrLoading] = useState(true);
  const [addrError, setAddrError] = useState(false);
  const [copied, setCopied] = useState(false);

  // Live deposit history from Nia-Hub.
  const [deposits, setDeposits] = useState<any[]>([]);
  const [depLoading, setDepLoading] = useState(true);

  const assetNetworks =
    currencies.find((c) => c.symbol === selectedAsset)?.networks ?? [];

  // Common assets float to the top so they're easy to find; the rest follow.
  const POPULAR = ['USDT', 'USDC', 'BTC', 'ETH'];
  const q = assetQuery.trim().toUpperCase();
  const displayCurrencies = currencies
    .filter((c) => !q || c.symbol.toUpperCase().includes(q))
    .slice()
    .sort((a, b) => {
      const pa = POPULAR.indexOf(a.symbol);
      const pb = POPULAR.indexOf(b.symbol);
      if (pa !== -1 || pb !== -1) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
      return a.symbol.localeCompare(b.symbol);
    });

  // Load the supported deposit currencies/networks from markets on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getNiaMarkets();
        // Keep only currencies with at least one deposit-enabled network.
        const list: CurrencyOption[] = (data?.currencies ?? [])
          .map((c: any) => ({
            symbol: c.symbol as string,
            networks: (c.networks ?? [])
              .filter((n: any) => n.depositEnabled)
              .map((n: any) => ({ code: n.networkCode as string, chainType: n.chainType as string })),
          }))
          .filter((c: CurrencyOption) => c.networks.length > 0);
        if (cancelled) return;
        setCurrencies(list);
        if (list.length) {
          setSelectedAsset(list[0].symbol);
          setSelectedNetwork(list[0].networks[0].code);
        } else {
          // No supported deposit assets — stop the address spinner, show the error state.
          setAddrLoading(false);
          setAddrError(true);
        }
      } catch {
        if (cancelled) return;
        setAddrLoading(false);
        setAddrError(true);
      } finally {
        if (!cancelled) setMarketsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Keep the selected network valid when the asset changes.
  useEffect(() => {
    if (!assetNetworks.length) return;
    if (!assetNetworks.some((n) => n.code === selectedNetwork)) {
      setSelectedNetwork(assetNetworks[0].code);
    }
  }, [selectedAsset, currencies]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch (idempotently create) the deposit address whenever asset/network changes.
  useEffect(() => {
    if (!selectedAsset || !selectedNetwork) return; // wait until markets resolve a selection
    let cancelled = false;
    setAddrLoading(true);
    setAddrError(false);
    setCopied(false);
    (async () => {
      try {
        const r = await createDepositAddress({ currency: selectedAsset, network: selectedNetwork });
        if (cancelled) return;
        setAddress(r.address);
        setMemo(r.memo);
      } catch {
        if (cancelled) return;
        setAddress('');
        setMemo('');
        setAddrError(true);
      } finally {
        if (!cancelled) setAddrLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedAsset, selectedNetwork]);

  const handleCopy = async () => {
    if (!address) return;
    const ok = await copyToClipboard(address);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const items = await getNiaDeposits();
        if (!cancelled) setDeposits(items);
      } catch {
        if (!cancelled) setDeposits([]);
      } finally {
        if (!cancelled) setDepLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
              <Download className="h-6 w-6 text-emerald-400" />
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

        {/* Left: asset selector + address - 3/5 */}
        <div className="lg:col-span-3 min-w-0 flex flex-col gap-5">
          <div className="p-6 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-4">
            <h3 className="font-sans font-extrabold text-[#d8e2ff] text-sm uppercase tracking-wider">
              {t('selectAsset')}
            </h3>

            {/* Asset chips — sourced live from Nia-Hub markets (deposit-enabled only) */}
            {marketsLoading ? (
              <div className="flex items-center gap-2.5 py-2">
                <Loader2 className="h-4 w-4 text-[#528dff] shrink-0 animate-spin" />
                <p className="text-xs font-mono text-[#8c90a0]">{t('loadingEllipsis')}</p>
              </div>
            ) : currencies.length === 0 ? (
              <p className="text-xs font-mono text-[#8c90a0] py-2">{t('addressError')}</p>
            ) : (
              <div className="flex flex-col gap-3">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8c90a0] pointer-events-none" />
                  <input
                    value={assetQuery}
                    onChange={(e) => setAssetQuery(e.target.value)}
                    placeholder={t('searchAsset')}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#020d24]/60 border border-[#1E3559] text-sm text-[#d8e2ff] placeholder-[#8c90a0] focus:outline-none focus:border-[#528dff]/60 transition-colors"
                  />
                </div>
                {displayCurrencies.length === 0 ? (
                  <p className="text-xs font-mono text-[#8c90a0] py-2">{t('noAssetMatch', { q: assetQuery })}</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-h-64 overflow-y-auto pr-1">
                    {displayCurrencies.map((c) => (
                      <button
                        key={c.symbol}
                        onClick={() => setSelectedAsset(c.symbol)}
                        className={`py-2.5 px-3 rounded-xl border text-sm font-bold font-mono transition-all cursor-pointer ${
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
              </div>
            )}

            {/* Network selector (shown only when the asset supports more than one) */}
            {assetNetworks.length > 1 && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-mono text-[#8c90a0] uppercase tracking-wider">
                  {t('networkLabel')}
                </span>
                <div className="flex flex-wrap gap-2.5">
                  {assetNetworks.map((n) => (
                    <button
                      key={n.code}
                      onClick={() => setSelectedNetwork(n.code)}
                      className={`py-2 px-4 rounded-xl border text-xs font-bold font-mono transition-all cursor-pointer ${
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

            {/* Deposit address */}
            <div className="mt-1 p-4 rounded-xl bg-[#020d24]/80 border border-[#1E3559] flex flex-col gap-3">
              <span className="text-xs font-mono text-[#8c90a0] uppercase tracking-wider">
                {t('depositAddressLabel', { asset: selectedAsset })}
              </span>

              {addrLoading ? (
                <div className="flex items-center gap-2.5 p-3 rounded-lg bg-[#0d1f3c]/60 border border-[#1E3559]">
                  <Loader2 className="h-4 w-4 text-[#528dff] shrink-0 animate-spin" />
                  <p className="text-xs text-[#8c90a0]">{t('generatingAddress', { asset: selectedAsset })}</p>
                </div>
              ) : addrError || !address ? (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                  <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-[#8c90a0] leading-relaxed">
                    {selectedNetwork
                      ? t('networkUnavailable', { network: selectedNetwork })
                      : t('addressError')}
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-[#0d1f3c]/60 border border-[#1E3559]">
                    <code className="text-xs sm:text-sm font-mono text-[#d8e2ff] break-all flex-1 min-w-0">
                      {address}
                    </code>
                    <button
                      onClick={handleCopy}
                      aria-label={t('copyAddress')}
                      className="p-2 rounded-lg border border-[#1E3559] bg-[#112643]/50 hover:bg-[#1e3459] text-[#8c90a0] hover:text-white transition-colors cursor-pointer shrink-0"
                    >
                      {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                  {copied && (
                    <span className="text-[11px] font-mono text-emerald-400">{t('copied')}</span>
                  )}

                  {/* Memo / tag — required for shared-master-wallet chains (e.g. TRON) */}
                  {memo && (
                    <div className="flex flex-col gap-2 mt-1">
                      <span className="text-xs font-mono text-[#8c90a0] uppercase tracking-wider">
                        {t('memoLabel')}
                      </span>
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-[#0d1f3c]/60 border border-[#1E3559]">
                        <code className="text-xs sm:text-sm font-mono text-[#d8e2ff] break-all flex-1 min-w-0">
                          {memo}
                        </code>
                        <button
                          onClick={() => copyToClipboard(memo)}
                          aria-label={t('copyAddress')}
                          className="p-2 rounded-lg border border-[#1E3559] bg-[#112643]/50 hover:bg-[#1e3459] text-[#8c90a0] hover:text-white transition-colors cursor-pointer shrink-0"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-[#8c90a0] leading-relaxed">{t('memoWarning')}</p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Warning */}
            <div className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/20 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-[#8c90a0] leading-relaxed">
                {t('warning', { asset: selectedAsset, network: selectedNetwork })}
              </p>
            </div>
          </div>
        </div>

        {/* Right: QR placeholder - 2/5 */}
        <div className="lg:col-span-2 min-w-0 flex flex-col gap-6">
          <div className="p-6 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col items-center gap-4">
            <h3 className="font-sans font-extrabold text-[#d8e2ff] text-sm uppercase tracking-wider self-start">
              {t('scanToDeposit')}
            </h3>
            {/* QR code of the live deposit address */}
            {address && !addrLoading && !addrError ? (
              <>
                <div className="w-44 h-44 rounded-2xl bg-white p-3 flex items-center justify-center">
                  <QRCodeSVG value={address} size={152} level="M" className="w-full h-full" />
                </div>
                <p className="text-[11px] font-mono text-[#8c90a0] text-center break-all">
                  {address}
                </p>
              </>
            ) : (
              <>
                <div className="w-44 h-44 rounded-2xl bg-[#020d24] border border-[#1E3559]/50 flex items-center justify-center opacity-40">
                  {addrLoading
                    ? <Loader2 className="h-16 w-16 text-[#528dff]/50 animate-spin" />
                    : <QrCode className="h-24 w-24 text-[#528dff]/50" />}
                </div>
                <p className="text-[11px] font-mono text-[#8c90a0] text-center">
                  {addrLoading ? t('generatingAddress', { asset: selectedAsset }) : t('qrUnavailable')}
                </p>
              </>
            )}
          </div>

          {/* Live deposit history */}
          <div className="p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="font-sans font-extrabold text-[#d8e2ff] text-sm uppercase tracking-wider">
                {t('recentDeposits')}
              </h3>
              <span className="text-[10px] font-mono text-[#8c90a0]">{t('viaNiaHub')}</span>
            </div>
            {depLoading ? (
              <p className="text-xs font-mono text-[#8c90a0] py-2">{t('loadingEllipsis')}</p>
            ) : deposits.length === 0 ? (
              <p className="text-xs font-mono text-[#8c90a0] py-2">{t('noDeposits')}</p>
            ) : (
              <div className="flex flex-col divide-y divide-[#1E3559]/40">
                {deposits.slice(0, 6).map((d, i) => (
                  <div key={d.id || i} className="flex items-center justify-between py-2.5 gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-emerald-400 font-mono">+{d.amount} {d.currency}</div>
                      <div className="text-[10px] font-mono text-[#8c90a0] truncate">{d.network} · {d.txHash}</div>
                    </div>
                    <span className="shrink-0 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {d.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
