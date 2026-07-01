'use client';

import { useTranslations } from 'next-intl';
import { Wallet, ArrowLeftRight, LayoutDashboard, Settings as SettingsIcon, Coins } from 'lucide-react';
import type { Screen } from '../types';

interface BottomNavProps {
  currentScreen: Screen;
  onNavigate: (screen: Screen, direction?: string) => void;
}

// Mobile-only bottom navigation bar (replaces the hamburger drawer on small
// screens). Dashboard sits in the centre. Uses the app's existing colors —
// dark surface + indigo active state, matching the desktop sidebar.
const ITEMS: { screen: Screen; icon: typeof Wallet; navKey: 'wallet' | 'swap' | 'portfolio' | 'staking' | 'settings' }[] = [
  { screen: 'WALLET_INTERFACE', icon: Wallet, navKey: 'wallet' },
  { screen: 'SWAP_INTERFACE', icon: ArrowLeftRight, navKey: 'swap' },
  { screen: 'PORTFOLIO_DASHBOARD', icon: LayoutDashboard, navKey: 'portfolio' },
  { screen: 'STAKING_INTERFACE', icon: Coins, navKey: 'staking' },
  { screen: 'SETTINGS_INTERFACE', icon: SettingsIcon, navKey: 'settings' },
];

export default function BottomNav({ currentScreen, onNavigate }: BottomNavProps) {
  const nav = useTranslations('nav');

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 flex items-stretch border-t border-slate-800 bg-[#06132a]/95 backdrop-blur overflow-x-auto">
      {ITEMS.map(({ screen, icon: Icon, navKey }) => {
        const active = currentScreen === screen;
        return (
          <button
            key={screen}
            onClick={() => onNavigate(screen, 'none')}
            aria-current={active ? 'page' : undefined}
            ref={active ? (el) => el?.scrollIntoView({ inline: 'center', block: 'nearest' }) : undefined}
            className={`flex-1 min-w-[62px] flex flex-col items-center justify-center gap-1 py-2.5 transition-colors cursor-pointer ${
              active ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="text-[10px] font-semibold tracking-tight">{nav(navKey)}</span>
          </button>
        );
      })}
    </nav>
  );
}
