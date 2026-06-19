'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Screen, Asset, SystemSettings } from '../types';
import { getNiaDeposits } from '../utils/niaApi';
import {
  ArrowLeft,
  QrCode,
  ShieldCheck,
  AlertTriangle,
  Download,
  Info
} from 'lucide-react';

interface DepositProps {
  assets: Asset[];
  settings: SystemSettings;
  onNavigate: (toScreen: Screen, direction: 'push' | 'push_back' | 'slide_up' | 'none') => void;
}

export default function Deposit({ assets, settings, onNavigate }: DepositProps) {
  const t = useTranslations('deposit');
  const [selectedAsset, setSelectedAsset] = useState<string>('ETH');

  // Live deposit history from Nia-Hub.
  const [deposits, setDeposits] = useState<any[]>([]);
  const [depLoading, setDepLoading] = useState(true);

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

            {/* Asset chips */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {assets.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelectedAsset(a.symbol)}
                  className={`py-2.5 px-3 rounded-xl border text-sm font-bold font-mono transition-all cursor-pointer ${
                    selectedAsset === a.symbol
                      ? 'bg-[#2E7DFF]/10 border-[#528dff]/50 text-white'
                      : 'bg-[#020d24]/50 border-[#1E3559] text-[#8c90a0] hover:text-white'
                  }`}
                >
                  {a.symbol}
                </button>
              ))}
            </div>

            {/* Deposit address unavailable */}
            <div className="mt-1 p-4 rounded-xl bg-[#020d24]/80 border border-[#1E3559] flex flex-col gap-3">
              <span className="text-xs font-mono text-[#8c90a0] uppercase tracking-wider">
                {t('depositAddressLabel', { asset: selectedAsset })}
              </span>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-[#0d1f3c]/60 border border-[#1E3559]">
                <Info className="h-4 w-4 text-[#528dff] shrink-0 mt-0.5" />
                <p className="text-xs text-[#8c90a0] leading-relaxed">
                  {t('addressUnavailablePrefix')} <span className="text-[#d8e2ff] font-semibold">{t('notYetAvailable')}</span>{' '}
                  {t('addressUnavailableMid', { asset: selectedAsset })}{' '}
                  <span className="text-[#528dff] font-semibold">{t('reachOutSupport')}</span>{t('addressUnavailableSuffix')}
                </p>
              </div>
            </div>

            {/* Warning */}
            <div className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/20 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-[#8c90a0] leading-relaxed">
                {t('warningPrefix')} <span className="text-amber-300 font-bold">{selectedAsset}</span> {t('warningOn')}{' '}
                <span className="text-amber-300 font-bold">{settings.activeChain}</span> {t('warningSuffix')}
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
            {/* QR placeholder — shown once a deposit address is provisioned */}
            <div className="w-44 h-44 rounded-2xl bg-[#020d24] border border-[#1E3559]/50 flex items-center justify-center opacity-40">
              <QrCode className="h-24 w-24 text-[#528dff]/50" />
            </div>
            <p className="text-[11px] font-mono text-[#8c90a0] text-center">
              {t('qrUnavailable')}
            </p>
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
