'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Screen, SystemSettings } from '../types';
import BanaLogo from './BanaLogo';
import {
  Wallet,
  ArrowLeftRight,
  Activity,
  Settings as SettingsIcon,
  Radio,
  Lock,
  Coins,
  LayoutDashboard,
  X,
  Building2,
} from 'lucide-react';

interface SidebarProps {
  currentScreen: Screen;
  onNavigate: (toScreen: Screen, direction: 'push' | 'push_back' | 'slide_up' | 'none') => void;
  settings: SystemSettings;
  // Mobile drawer controls (sidebar renders off-canvas below the lg breakpoint)
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export default function Sidebar({
  currentScreen,
  onNavigate,
  settings,
  mobileOpen = false,
  onCloseMobile
}: SidebarProps) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';
  const pathname = usePathname();

  // Work out transition directions depending on navigation source and destination
  const navigateTo = (target: Screen) => {
    if (currentScreen === target) return;

    let dir: 'push' | 'push_back' | 'slide_up' | 'none' = 'push';

    // Matrix mapping of navigation flow requirements
    if (target === 'PORTFOLIO_DASHBOARD') {
      dir = 'push_back'; // Going home is always a push_back (return to origin)
    } else if (currentScreen === 'SETTINGS_INTERFACE' && target === 'SWAP_INTERFACE') {
      dir = 'push';
    } else if (currentScreen === 'SETTINGS_INTERFACE' && target === 'ACTIVITY_HISTORY') {
      dir = 'push';
    } else if (currentScreen === 'SWAP_INTERFACE' && target === 'ACTIVITY_HISTORY') {
      dir = 'push';
    } else if (currentScreen === 'SWAP_INTERFACE' && target === 'SETTINGS_INTERFACE') {
      dir = 'push';
    } else if (currentScreen === 'ACTIVITY_HISTORY' && target === 'SETTINGS_INTERFACE') {
      dir = 'push';
    } else if (currentScreen === 'ACTIVITY_HISTORY' && target === 'SWAP_INTERFACE') {
      dir = 'push';
    }

    onNavigate(target, dir);
  };

  // Helper to detect if item is active
  const isActive = (screenName: Screen) => currentScreen === screenName;

  const truncateAddress = (addr: string) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <>
      {/* Mobile backdrop — dims content and closes the drawer on tap */}
      <div
        onClick={onCloseMobile}
        className={`lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      <aside
        className={`w-72 max-w-[85vw] bg-slate-900/95 lg:bg-slate-900/50 border-r border-slate-800 flex flex-col justify-between py-6 px-5 h-screen select-none
          fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-out
          lg:static lg:shrink-0 lg:translate-x-0 lg:transition-none
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Mobile-only close button */}
        <button
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden absolute top-5 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Top Brand Block */}
        <div className="flex flex-col gap-8">
          <BanaLogo />

        {/* Navigation Elements */}
        <nav className="flex flex-col gap-2.5 mt-4">
          {/* Portfolio Dashboard */}
          <a
            href="#portfolio"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('PORTFOLIO_DASHBOARD');
            }}
            className={`flex items-center gap-4 px-4 py-3.5 rounded-xl font-sans text-[15px] font-semibold transition-all duration-300 ${
              isActive('PORTFOLIO_DASHBOARD')
                ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.15)] font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30 border border-transparent'
            }`}
          >
            <LayoutDashboard className={`h-5 w-5 ${isActive('PORTFOLIO_DASHBOARD') ? 'text-indigo-400' : 'text-slate-400'}`} />
            Portfolio
          </a>

          {/* Wallet */}
          <a
            href="#wallet"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('WALLET_INTERFACE');
            }}
            className={`flex items-center gap-4 px-4 py-3.5 rounded-xl font-sans text-[15px] font-semibold transition-all duration-300 ${
              isActive('WALLET_INTERFACE')
                ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.15)] font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30 border border-transparent'
            }`}
          >
            <Wallet className={`h-5 w-5 ${isActive('WALLET_INTERFACE') ? 'text-indigo-400' : 'text-slate-400'}`} />
            Wallet
          </a>

          {/* Swap Assets */}
          <a
            href="#swap"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('SWAP_INTERFACE');
            }}
            className={`flex items-center gap-4 px-4 py-3.5 rounded-xl font-sans text-[15px] font-semibold transition-all duration-300 ${
              isActive('SWAP_INTERFACE')
                ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.15)] font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30 border border-transparent'
            }`}
          >
            <ArrowLeftRight className={`h-5 w-5 ${isActive('SWAP_INTERFACE') ? 'text-indigo-400' : 'text-slate-400'}`} />
            Swap
          </a>

          {/* Staking */}
          <a
            href="#staking"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('STAKING_INTERFACE');
            }}
            className={`flex items-center gap-4 px-4 py-3.5 rounded-xl font-sans text-[15px] font-semibold transition-all duration-300 ${
              isActive('STAKING_INTERFACE')
                ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.15)] font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30 border border-transparent'
            }`}
          >
            <Coins className={`h-5 w-5 ${isActive('STAKING_INTERFACE') ? 'text-indigo-400' : 'text-slate-400'}`} />
            Staking
          </a>

          {/* Activity Log */}
          <a
            href="#activity"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('ACTIVITY_HISTORY');
            }}
            className={`flex items-center gap-4 px-4 py-3.5 rounded-xl font-sans text-[15px] font-semibold transition-all duration-300 ${
              isActive('ACTIVITY_HISTORY')
                ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.15)] font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30 border border-transparent'
            }`}
          >
            <Activity className={`h-5 w-5 ${isActive('ACTIVITY_HISTORY') ? 'text-indigo-400' : 'text-slate-400'}`} />
            Activity
          </a>

          {/* Settings Section */}
          <a
            href="#settings"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('SETTINGS_INTERFACE');
            }}
            className={`flex items-center gap-4 px-4 py-3.5 rounded-xl font-sans text-[15px] font-semibold transition-all duration-300 ${
              isActive('SETTINGS_INTERFACE')
                ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.15)] font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30 border border-transparent'
            }`}
          >
            <SettingsIcon className={`h-5 w-5 ${isActive('SETTINGS_INTERFACE') ? 'text-indigo-400' : 'text-slate-400'}`} />
            Settings
          </a>

          {/* Settlement — admin-only entry */}
          {isAdmin && (
            <Link
              href="/admin/settlement"
              onClick={onCloseMobile}
              className={`flex items-center gap-4 px-4 py-3.5 rounded-xl font-sans text-[15px] font-semibold transition-all duration-300 ${
                pathname === '/admin/settlement'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.15)] font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30 border border-transparent'
              }`}
            >
              <Building2 className={`h-5 w-5 ${pathname === '/admin/settlement' ? 'text-amber-400' : 'text-slate-400'}`} />
              Settlement
            </Link>
          )}
        </nav>
      </div>

      {/* Connection & Account Area */}
      <div className="flex flex-col gap-4">
        {/* Connection Box Panel */}
        <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-700/50 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 flex items-center gap-1.5 font-bold uppercase tracking-widest">
              <Radio className="h-3.5 w-3.5 text-indigo-400 animate-pulse" />
              {settings.activeChain} Node
            </span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              ● ONLINE
            </span>
          </div>

          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-slate-400 flex items-center gap-1 font-semibold">
              <Lock className="h-3 w-3" /> Secure MEV
            </span>
            <span className={`font-bold font-mono ${settings.mevProtection ? 'text-indigo-400' : 'text-rose-400'}`}>
              {settings.mevProtection ? 'ACTIVE' : 'INACTIVE'}
            </span>
          </div>
        </div>

        {/* Vault address (static, informational) */}
        <div className="w-full py-3 rounded-xl bg-slate-800/40 border border-slate-700/50 flex flex-col items-center select-none">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Vault Address</span>
          <span className="font-mono text-sm text-slate-200 tracking-wide mt-0.5">{truncateAddress(settings.connectedWallet)}</span>
        </div>
      </div>
      </aside>
    </>
  );
}
