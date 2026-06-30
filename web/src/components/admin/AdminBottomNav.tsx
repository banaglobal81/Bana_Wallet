'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { LayoutDashboard, ArrowUpRight, Coins, Users, SlidersHorizontal, Sprout, CircleDollarSign } from 'lucide-react';

// Mobile-only bottom navigation for the admin area (replaces the hamburger
// drawer on small screens). Uses the admin amber accent for the active item.
// Dashboard sits in the centre.
const ITEMS: { href: string; icon: typeof Users; navKey: 'dashboard' | 'withdrawals' | 'settlement' | 'users' | 'settings' | 'staking' | 'coins' }[] = [
  { href: '/admin/withdrawals', icon: ArrowUpRight, navKey: 'withdrawals' },
  { href: '/admin/settlement', icon: Coins, navKey: 'settlement' },
  { href: '/admin/staking', icon: Sprout, navKey: 'staking' },
  { href: '/admin/dashboard', icon: LayoutDashboard, navKey: 'dashboard' },
  { href: '/admin/coins', icon: CircleDollarSign, navKey: 'coins' },
  { href: '/admin/users', icon: Users, navKey: 'users' },
  { href: '/admin/settings', icon: SlidersHorizontal, navKey: 'settings' },
];

export default function AdminBottomNav() {
  const nav = useTranslations('nav');
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 flex items-stretch border-t border-amber-500/15 bg-[#0a0f1e]/95 backdrop-blur overflow-x-auto">
      {ITEMS.map(({ href, icon: Icon, navKey }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            ref={active ? (el) => el?.scrollIntoView({ inline: 'center', block: 'nearest' }) : undefined}
            className={`flex-1 min-w-[62px] flex flex-col items-center justify-center gap-1 py-2.5 transition-colors ${
              active ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="text-[10px] font-semibold tracking-tight">{nav(navKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
