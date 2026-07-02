'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Screen, SystemSettings } from '../types';
import { useSession, signOut } from 'next-auth/react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import {
  Settings as SettingsIcon,
  Activity as ActivityIcon,
  ShieldCheck,
  Coins,
  Building2,
  Users as UsersIcon,
  User,
  LogOut,
} from 'lucide-react';

interface ProfileMenuProps {
  settings: SystemSettings;
  onNavigate: (toScreen: Screen, direction: 'push' | 'push_back' | 'slide_up' | 'none') => void;
}

// Plain human icon — no colored/gradient background.
const Avatar = ({ className = '' }: { className?: string }) => (
  <User className={`select-none ${className}`} strokeWidth={1.8} />
);

export default function ProfileMenu({ settings, onNavigate }: ProfileMenuProps) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';
  const pathname = usePathname();
  // Which app are we in? The menu offers admin nav inside /admin, user nav elsewhere —
  // so an admin never gets bounced out of the admin area by these links.
  const isAdminArea = pathname.startsWith('/admin');
  const locale = useLocale();
  const t = useTranslations('profileMenu');
  const nav = useTranslations('nav');
  const common = useTranslations('common');
  const [open, setOpen] = useState(false);
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

  const go = (s: Screen) => {
    setOpen(false);
    onNavigate(s, 'push');
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t('profileButton')}
        aria-expanded={open}
        className="relative p-2 rounded-xl border border-slate-700 bg-slate-800/40 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer"
      >
        <Avatar className="h-5 w-5" />
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
            <div className="h-11 w-11 shrink-0 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
              <Avatar className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-white">{t('myAccount')}</div>
              {session?.user?.email && (
                <div className="text-[11px] text-slate-400 truncate">{session.user.email}</div>
              )}
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
                  {t('admin')}
                </span>
              )}
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                settings.walletConnected
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
              }`}>
                {settings.walletConnected ? t('connected') : t('offline')}
              </span>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1.5">
            {isAdminArea ? (
              <>
                {/* Admin-area nav — stays within the admin section */}
                <Link href="/admin/settlement" onClick={() => setOpen(false)} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800/50 transition-colors cursor-pointer">
                  <Coins className="h-4 w-4 text-slate-400" /> {nav('settlement')}
                </Link>
                <Link href="/admin/users" onClick={() => setOpen(false)} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800/50 transition-colors cursor-pointer">
                  <UsersIcon className="h-4 w-4 text-slate-400" /> {nav('users')}
                </Link>
                <Link href="/portfolio" onClick={() => setOpen(false)} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800/50 transition-colors cursor-pointer">
                  <ActivityIcon className="h-4 w-4 text-slate-400" /> {common('backToWallet')}
                </Link>
              </>
            ) : (
              <>
                {/* User-app nav */}
                <button onClick={() => go('ACTIVITY_HISTORY')} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800/50 transition-colors cursor-pointer">
                  <ActivityIcon className="h-4 w-4 text-slate-400" /> {nav('activity')}
                </button>
                <button onClick={() => go('STAKING_INTERFACE')} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800/50 transition-colors cursor-pointer">
                  <Coins className="h-4 w-4 text-slate-400" /> {nav('staking')}
                </button>
                <button onClick={() => go('SETTINGS_INTERFACE')} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800/50 transition-colors cursor-pointer">
                  <SettingsIcon className="h-4 w-4 text-slate-400" /> {nav('settings')}
                </button>
              </>
            )}

            {/* Divider + Log out */}
            <div className="my-1 border-t border-slate-800" />
            <button
              onClick={async () => {
                // Clear the session, then redirect client-side with a relative
                // path. We do NOT use signOut({ redirectTo }) because behind a
                // proxy (Railway) Auth.js resolves the base URL from its internal
                // host and sends the browser to localhost:8080 (its internal
                // port), which is unreachable. A client-side relative redirect
                // always uses the real origin the user is on.
                await signOut({ redirect: false });
                window.location.assign(`/${locale}/login`);
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4" /> {common('logOut')}
            </button>
          </div>

        </div>
      )}
    </div>
  );
}
