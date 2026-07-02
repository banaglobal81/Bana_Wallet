'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import BanaLogo from '@/components/BanaLogo';
import {
  LayoutDashboard, ArrowUpRight, Coins, Users, SlidersHorizontal, Building2, X, Sprout, CircleDollarSign,
} from 'lucide-react';

interface AdminSidebarProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

// Vertical admin navigation — same layout/style as the user wallet sidebar,
// with a silver accent (matching the BANA logo).
export default function AdminSidebar({ mobileOpen = false, onCloseMobile }: AdminSidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const nav = useTranslations('nav');
  const t = useTranslations('admin');
  const sb = useTranslations('sidebar');

  const items = [
    { href: '/admin/dashboard', label: nav('dashboard'), icon: LayoutDashboard },
    { href: '/admin/withdrawals', label: nav('withdrawals'), icon: ArrowUpRight },
    { href: '/admin/settlement', label: nav('settlement'), icon: Coins },
    { href: '/admin/staking', label: nav('staking'), icon: Sprout },
    { href: '/admin/coins', label: nav('coins'), icon: CircleDollarSign },
    { href: '/admin/users', label: nav('users'), icon: Users },
    { href: '/admin/settings', label: nav('settings'), icon: SlidersHorizontal },
  ];
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <>
      {/* Mobile backdrop */}
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
        <button
          onClick={onCloseMobile}
          aria-label={sb('closeMenu')}
          className="lg:hidden absolute top-5 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Brand + ADMIN badge */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 items-center">
            <Link href="/admin/dashboard" aria-label="Home" className="flex">
              <BanaLogo size="fill" />
            </Link>
            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-400/10 border border-slate-400/30 rounded-lg text-slate-200 font-bold text-[11px] font-mono tracking-wider">
              <Building2 className="h-3.5 w-3.5" /> {t('badge')}
            </span>
          </div>

          {/* Navigation */}
          <nav className="flex flex-col gap-2.5">
            {items.map(({ href, label, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onCloseMobile}
                  className={`flex items-center gap-4 px-4 py-3.5 rounded-xl font-sans text-[15px] font-semibold transition-all duration-300 ${
                    active
                      ? 'bg-slate-400/10 text-slate-200 border border-slate-400/25 shadow-[0_0_15px_rgba(203,210,220,0.16)] font-bold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30 border border-transparent'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${active ? 'text-slate-200' : 'text-slate-400'}`} />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom: signed-in account */}
        <div className="flex flex-col gap-4">
          {session?.user?.email && (
            <div className="w-full py-3 px-3 rounded-xl bg-slate-800/40 border border-slate-700/50 flex flex-col items-center select-none">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{sb('account')}</span>
              <span className="font-mono text-xs text-slate-200 tracking-wide mt-0.5 truncate max-w-full">{session.user.email}</span>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
