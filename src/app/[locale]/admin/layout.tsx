'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Building2, ArrowLeft, Lock, Coins } from 'lucide-react';
import { useApp } from '@/app/providers';
import { useScreenNav } from '@/lib/useScreenNav';
import BanaLogo from '@/components/BanaLogo';
import Notifications from '@/components/Notifications';
import ProfileMenu from '@/components/ProfileMenu';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { settings } = useApp();
  const navigate = useScreenNav();
  const t = useTranslations('admin');
  const nav = useTranslations('nav');
  const common = useTranslations('common');

  // Admin navigation entries (extend as the admin area grows).
  const ADMIN_NAV = [
    { href: '/admin/settlement', label: nav('settlement'), icon: Coins },
  ];

  // While the session is loading, render nothing to avoid flash
  if (status === 'loading') {
    return null;
  }

  // Central role guard for the whole admin area — non-admins never see admin chrome.
  if (session?.user?.role !== 'ADMIN') {
    return (
      <div className="w-screen h-screen bg-[#06132a] text-[#d8e2ff] flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full p-8 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col items-center gap-5 text-center">
          <div className="p-4 bg-rose-500/10 rounded-full border border-rose-500/20">
            <Lock className="h-8 w-8 text-rose-400" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-white">{t('brokerAccessOnly')}</h2>
            <p className="mt-2 text-sm text-[#8c90a0] leading-relaxed">
              {t.rich('brokerAccessBody', {
                highlight: (chunks) => (
                  <span className="text-amber-400 font-bold">{chunks}</span>
                ),
              })}
            </p>
          </div>
          <Link
            href="/portfolio"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2E7DFF] text-white text-sm font-bold hover:bg-[#1a6aff] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {common('backToWallet')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-screen h-screen bg-[#06132a] text-[#d8e2ff] overflow-hidden font-sans antialiased selection:bg-amber-500/30 selection:text-white">
      {/* Admin top bar — visually distinct (amber) from the user app */}
      <header className="flex items-center justify-between gap-3 h-16 px-4 sm:px-6 shrink-0 border-b border-amber-500/20 bg-[#0a0f1e]/95 backdrop-blur z-20">
        <div className="flex items-center gap-3">
          <BanaLogo size="sm" />
          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 font-bold text-[11px] font-mono tracking-wider select-none">
            <Building2 className="h-3.5 w-3.5" /> {t('badge')}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Notifications />
          <ProfileMenu settings={settings} onNavigate={navigate} />
        </div>
      </header>

      {/* Admin nav row */}
      <nav className="flex items-center gap-1.5 px-4 sm:px-6 h-12 shrink-0 border-b border-[#1E3559]/60 bg-[#06132a]/80">
        {ADMIN_NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-colors ${
                active
                  ? 'bg-amber-500/10 border border-amber-500/25 text-amber-400'
                  : 'border border-transparent text-[#8c90a0] hover:text-white hover:bg-[#112643]/60'
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </Link>
          );
        })}
        <Link
          href="/portfolio"
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold font-mono text-[#8c90a0] hover:text-white hover:bg-[#112643]/60 border border-transparent transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {common('backToWallet')}
        </Link>
      </nav>

      {/* Admin content */}
      <main className="flex-1 min-w-0 relative overflow-hidden bg-[#06132a]">{children}</main>
    </div>
  );
}
