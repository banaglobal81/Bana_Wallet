'use client';

import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslations } from 'next-intl';
import { Screen, Asset, SystemSettings } from '../types';
import { getNiaDeposits, createDepositAddress, getNiaMarkets } from '../utils/niaApi';
import { getManagedCoins } from '../utils/coinsApi';
import { copyToClipboard } from '../utils/clipboard';
import { AlertTriangle, Info, Copy, Check, Loader2, ShieldCheck } from 'lucide-react';
import FlowNav from './wallet/FlowNav';
import Step from './wallet/Step';
import { CoinSelect, NetworkSelect } from './wallet/Selects';

interface DepositProps {
  assets: Asset[];
  settings: SystemSettings;
  onNavigate: (toScreen: Screen, direction: 'push' | 'push_back' | 'slide_up' | 'none') => void;
}

// A deposit-enabled (currency, network) catalogue entry, derived live from
// /api/nia/markets — so the coins and network codes always match what the
// tenant actually supports.
interface CurrencyOption {
  symbol: string;
  networks: { code: string; chainType?: string }[];
}

export default function Deposit(_props: DepositProps) {
  const t = useTranslations('deposit');

  const [currencies, setCurrencies] = useState<CurrencyOption[]>([]);
  const [marketsLoading, setMarketsLoading] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState<string>('');
  const [selectedNetwork, setSelectedNetwork] = useState<string>('');

  const [address, setAddress] = useState<string>('');
  const [memo, setMemo] = useState<string>('');
  const [addrLoading, setAddrLoading] = useState(false);
  const [addrError, setAddrError] = useState(false);
  const [copied, setCopied] = useState(false);

  const [deposits, setDeposits] = useState<any[]>([]);
  const [depLoading, setDepLoading] = useState(true);

  const assetNetworks = currencies.find((c) => c.symbol === selectedAsset)?.networks ?? [];

  const POPULAR = ['USDT', 'USDC', 'BTC', 'ETH'];
  const orderedSymbols = currencies
    .map((c) => c.symbol)
    .sort((a, b) => {
      const pa = POPULAR.indexOf(a); const pb = POPULAR.indexOf(b);
      if (pa !== -1 || pb !== -1) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
      return a.localeCompare(b);
    });

  // Load supported deposit currencies/networks from markets on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [data, managed] = await Promise.all([getNiaMarkets(), getManagedCoins()]);
        const list: CurrencyOption[] = (data?.currencies ?? [])
          .map((c: any) => ({
            symbol: c.symbol as string,
            networks: (c.networks ?? [])
              .filter((n: any) => n.depositEnabled)
              .map((n: any) => ({ code: n.networkCode as string, chainType: n.chainType as string })),
          }))
          .filter((c: CurrencyOption) => c.networks.length > 0);
        // Merge admin-added custom coins not already provided by the hub.
        const seen = new Set(list.map((c) => c.symbol.toUpperCase()));
        for (const m of managed) {
          if (seen.has(m.symbol.toUpperCase())) continue;
          // Mirror the hub path: only surface networks that accept deposits.
          const nets = m.networks
            .filter((n) => n.depositEnabled !== false)
            .map((n) => ({ code: n.code, chainType: 'EVM' }));
          if (nets.length) list.push({ symbol: m.symbol, networks: nets });
        }
        if (cancelled) return;
        setCurrencies(list);
      } catch {
        /* leave empty — selectors show no options */
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
    if (!selectedAsset || !selectedNetwork) { setAddress(''); setMemo(''); return; }
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
        setAddress(''); setMemo(''); setAddrError(true);
      } finally {
        if (!cancelled) setAddrLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedAsset, selectedNetwork]);

  const handleCopy = async (text: string) => {
    if (!text) return;
    if (await copyToClipboard(text)) {
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

  const hasCoin = !!selectedAsset;
  const hasNetwork = !!selectedNetwork;

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
          {/* Step 1 — Select Coin */}
          <Step n={1} title={t('selectCoinTitle')} active>
            {marketsLoading ? (
              <div className="flex items-center gap-2.5 py-2"><Loader2 className="h-4 w-4 text-[#528dff] animate-spin" /><span className="text-xs font-mono text-[#8c90a0]">{t('loadingEllipsis')}</span></div>
            ) : (
              <CoinSelect
                value={selectedAsset}
                options={orderedSymbols}
                onChange={setSelectedAsset}
                placeholder={t('selectCoin')}
                searchPlaceholder={t('searchCoin')}
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
              disabled={!hasCoin}
            />
            <p className="text-xs text-[#8c90a0] mt-2 leading-relaxed">{t('networkHint')}</p>
          </Step>

          {/* Step 3 — Deposit Address */}
          <Step n={3} title={t('depositAddressTitle')} active={hasCoin && hasNetwork} last>
            <div className="p-5 rounded-2xl bg-[#0a1b33]/70 border border-[#1E3559] flex flex-col gap-4">
              {!hasCoin || !hasNetwork ? (
                <div className="flex items-center gap-2.5 py-6 justify-center text-center">
                  <Info className="h-4 w-4 text-[#56607a] shrink-0" />
                  <span className="text-sm text-[#56607a]">{t('selectCoinFirst')}</span>
                </div>
              ) : addrLoading ? (
                <div className="flex items-center gap-2.5 py-6 justify-center"><Loader2 className="h-5 w-5 text-[#528dff] animate-spin" /><span className="text-sm text-[#8c90a0]">{t('generatingAddress', { asset: selectedAsset })}</span></div>
              ) : addrError || !address ? (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                  <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-[#8c90a0] leading-relaxed">{hasNetwork ? t('networkUnavailable', { network: selectedNetwork }) : t('addressError')}</p>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-5">
                  <div className="flex-1 min-w-0 flex flex-col gap-3">
                    <div>
                      <span className="text-xs font-mono text-[#8c90a0] uppercase tracking-wider">{t('addressLabel')}</span>
                      <div className="mt-1.5 p-3 rounded-xl bg-[#06132a] border border-[#1E3559]">
                        <code className="text-xs sm:text-sm font-mono text-white break-all">{address}</code>
                      </div>
                      <button
                        onClick={() => handleCopy(address)}
                        className="mt-2 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#1E3559] bg-[#112643]/60 hover:bg-[#1e3459] text-[#afc6ff] hover:text-white text-xs font-bold transition-colors cursor-pointer"
                      >
                        {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                        {copied ? t('copied') : t('copyBtn')}
                      </button>
                    </div>

                    {/* Memo / tag — required for shared-master-wallet chains (e.g. TRON) */}
                    {memo && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-mono text-[#8c90a0] uppercase tracking-wider">{t('memoLabel')}</span>
                        <div className="flex items-center gap-2 p-3 rounded-xl bg-[#06132a] border border-[#1E3559]">
                          <code className="text-xs sm:text-sm font-mono text-white break-all flex-1 min-w-0">{memo}</code>
                          <button onClick={() => copyToClipboard(memo)} aria-label={t('copyAddress')} className="p-1.5 rounded-lg border border-[#1E3559] bg-[#112643]/60 hover:bg-[#1e3459] text-[#8c90a0] hover:text-white transition-colors cursor-pointer shrink-0"><Copy className="h-4 w-4" /></button>
                        </div>
                        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
                          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                          <p className="text-[11px] text-[#8c90a0] leading-relaxed">{t('memoWarning')}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* QR of the live deposit address */}
                  <div className="shrink-0 flex flex-col items-center gap-2">
                    <div className="w-36 h-36 rounded-2xl bg-white p-2.5 flex items-center justify-center">
                      <QRCodeSVG value={address} size={130} level="M" className="w-full h-full" />
                    </div>
                  </div>
                </div>
              )}

              {/* Honest deposit guidance — only once a real address is shown */}
              {hasCoin && hasNetwork && address && !addrLoading && !addrError && (
                <ul className="flex flex-col gap-1.5 text-xs text-[#8c90a0] list-disc pl-4 marker:text-[#3a5278]">
                  <li>{t.rich('sendOnlyWarning', { coin: selectedAsset, network: selectedNetwork, b: (c) => <span className="text-[#528dff] font-bold">{c}</span> })}</li>
                  <li>{t('confirmationsNote')}</li>
                </ul>
              )}
            </div>
          </Step>

          {/* Recent deposits — real, live from Nia-Hub */}
          <div className="mt-2 p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="font-sans font-extrabold text-[#d8e2ff] text-sm uppercase tracking-wider">{t('recentDeposits')}</h3>
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
                    <span className="shrink-0 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{d.status}</span>
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
