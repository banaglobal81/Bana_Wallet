'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Screen, SystemSettings } from '../types';
import { copyToClipboard } from '../utils/clipboard';
import { useSession, signOut } from 'next-auth/react';
import { useLocale } from 'next-intl';
import {
  Settings as SettingsIcon,
  Activity as ActivityIcon,
  Copy,
  Check,
  ShieldCheck,
  Coins,
  Building2,
  LogOut,
} from 'lucide-react';

interface ProfileMenuProps {
  settings: SystemSettings;
  onNavigate: (toScreen: Screen, direction: 'push' | 'push_back' | 'slide_up' | 'none') => void;
}

const Avatar = ({ className = '' }: { className?: string }) => (
  <div className={`rounded-xl bg-gradient-to-tr from-slate-800 to-indigo-500 p-[1.5px] items-center justify-center flex shadow-[0_0_10px_rgba(99,102,241,0.15)] select-none ${className}`}>
    <div className="w-full h-full rounded-[10px] bg-slate-950 flex items-center justify-center overflow-hidden">
      <svg viewBox="0 0 100 100" className="w-[85%] h-[85%] text-indigo-300" fill="none" stroke="currentColor" strokeWidth="8">
        <polygon points="50,15 80,35 80,65 50,85 20,65 20,35" fill="#1e293b" stroke="#6366f1" strokeWidth="4" />
        <circle cx="50" cy="45" r="16" stroke="#c7d2fe" strokeWidth="4" />
        <path d="M28 72 C 32 55, 68 55, 72 72" stroke="#c7d2fe" strokeWidth="4" strokeLinecap="round" />
      </svg>
    </div>
  </div>
);

export default function ProfileMenu({ settings, onNavigate }: ProfileMenuProps) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const truncate = (a: string) => (a ? `${a.slice(0, 6)}...${a.slice(-4)}` : '');

  const handleCopy = async () => {
    await copyToClipboard(settings.connectedWallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const go = (s: Screen) => {
    setOpen(false);
    onNavigate(s, 'push');
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Profile menu"
        aria-expanded={open}
        className="relative h-10 w-10 cursor-pointer transition-transform hover:scale-105 active:scale-95"
      >
        <Avatar className="h-10 w-10" />
        {isAdmin && (
          <span className="absolute -bottom-1 -right-1 h-4 w-4 flex items-center justify-center rounded-full bg-amber-500 border-2 border-[#06132a]">
            <Building2 className="h-2.5 w-2.5 text-white" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl shadow-black/40 z-50 overflow-hidden">
          {/* Identity header */}
          <div className="p-4 flex items-center gap-3 border-b border-slate-800">
            <Avatar className="h-11 w-11 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-bold text-white">My Account</div>
              {session?.user?.email && (
                <div className="text-[11px] text-slate-400 truncate">{session.user.email}</div>
              )}
              <div className="text-[11px] font-mono text-slate-400 truncate">{truncate(settings.connectedWallet)}</div>
            </div>
          </div>

          {/* Status row */}
          <div className="px-4 py-2.5 flex items-center justify-between border-b border-slate-800 bg-slate-950/40">
            <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> {settings.activeChain}
            </span>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/20">
                  ADMIN
                </span>
              )}
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                settings.walletConnected
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
              }`}>
                {settings.walletConnected ? '● CONNECTED' : '● OFFLINE'}
              </span>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1.5">
            <button onClick={handleCopy} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800/50 transition-colors cursor-pointer">
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4 text-slate-400" />}
              {copied ? 'Address copied' : 'Copy address'}
            </button>
            <button onClick={() => go('ACTIVITY_HISTORY')} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800/50 transition-colors cursor-pointer">
              <ActivityIcon className="h-4 w-4 text-slate-400" /> Activity
            </button>
            <button onClick={() => go('STAKING_INTERFACE')} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800/50 transition-colors cursor-pointer">
              <Coins className="h-4 w-4 text-slate-400" /> Staking
            </button>
            <button onClick={() => go('SETTINGS_INTERFACE')} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800/50 transition-colors cursor-pointer">
              <SettingsIcon className="h-4 w-4 text-slate-400" /> Settings
            </button>

            {/* Divider + Log out */}
            <div className="my-1 border-t border-slate-800" />
            <button
              onClick={() => signOut({ redirectTo: `/${locale}/login` })}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </div>

        </div>
      )}
    </div>
  );
}
