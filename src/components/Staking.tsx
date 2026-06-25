'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Screen, SystemSettings } from '../types';
import { Coins, Clock, ChevronRight } from 'lucide-react';

interface StakingProps {
  settings: SystemSettings;
  onNavigate: (toScreen: Screen, direction: 'push' | 'push_back' | 'slide_up' | 'none') => void;
}

// Staking has no Nia-Hub backend yet, so rather than show fake pools/APYs we present
// an honest "coming soon" state. No mock data, no non-functional actions.
export default function Staking({ onNavigate }: StakingProps) {
  const t = useTranslations('staking');

  return (
    <div className="flex-1 min-h-full bg-[#06132a] text-[#d8e2ff] p-4 sm:p-6 lg:p-8 flex flex-col gap-6 overflow-y-auto">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center pb-2 border-b border-[#1E3559]/40">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <Coins className="h-7 w-7 text-[#528dff]" />
            {t('pageTitle')}
          </h1>
          <p className="text-xs sm:text-sm text-[#8c90a0] mt-1 font-mono">{t('pageSubtitle')}</p>
        </div>
      </header>

      {/* Coming soon */}
      <div className="flex-1 flex items-center justify-center py-12">
        <div className="max-w-md w-full p-8 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col items-center gap-4 text-center">
          <div className="p-4 rounded-full bg-[#528dff]/10 border border-[#528dff]/20">
            <Clock className="h-8 w-8 text-[#528dff]" />
          </div>
          <h2 className="text-xl font-extrabold text-white">{t('comingSoonTitle')}</h2>
          <p className="text-sm text-[#8c90a0] leading-relaxed">{t('comingSoonBody')}</p>
          <button
            onClick={() => onNavigate('PORTFOLIO_DASHBOARD', 'push_back')}
            className="mt-1 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#112643] hover:bg-[#1e3459] border border-[#1E3559] text-white text-sm font-bold transition-colors cursor-pointer"
          >
            {t('backToPortfolio')} <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
