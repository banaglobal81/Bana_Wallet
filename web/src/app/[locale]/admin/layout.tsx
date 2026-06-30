'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Building2, ArrowLeft, Lock } from 'lucide-react';
import { useApp } from '@/app/providers';
import { useScreenNav } from '@/lib/useScreenNav';
import BanaLogo from '@/components/BanaLogo';
import Notifications from '@/components/Notifications';
import ProfileMenu from '@/components/ProfileMenu';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import ThemeToggle from '@/components/ThemeToggle';
import AdminSidebar from '@/components/admin/AdminSidebar';
import AdminBottomNav from '@/components/admin/AdminBottomNav';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const { settings } = useApp();
  const navigate = useScreenNav();
  const t = useTranslations('admin');
  const common = useTranslations('common');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
    <div className="flex w-screen h-screen bg-[#06132a] text-[#d8e2ff] overflow-hidden font-sans antialiased selection:bg-amber-500/30 selection:text-white">
      {/* Vertical admin sidebar — static on desktop, off-canvas drawer on mobile */}
      <AdminSidebar mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />

      {/* Content column: top chrome bar + routed children */}
      <div className="flex-1 min-w-0 h-full flex flex-col">
        {/* Mobile-only top bar: brand + ADMIN badge + chrome + hamburger */}
        <header className="lg:hidden flex items-center justify-between gap-3 h-16 px-4 shrink-0 border-b border-amber-500/20 bg-[#0a0f1e]/95 backdrop-blur z-20">
          <div className="flex items-center gap-2">
            <BanaLogo size="sm" />
            <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 rounded text-amber-400 font-bold text-[10px] font-mono tracking-wider">
              <Building2 className="h-3 w-3" /> {t('badge')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
            <Notifications />
            <ProfileMenu settings={settings} onNavigate={navigate} />
          </div>
        </header>

        {/* Desktop-only top bar: persistent chrome, right-aligned */}
        <header className="hidden lg:flex items-center justify-end gap-3 h-14 px-6 shrink-0 border-b border-amber-500/15 bg-[#0a0f1e]/60 backdrop-blur z-20">
          <LanguageSwitcher />
          <ThemeToggle />
          <Notifications />
          <ProfileMenu settings={settings} onNavigate={navigate} />
        </header>

        {/* Admin content — min-h-0 + overflow-y-auto so tall pages (e.g. Settings) scroll;
            extra bottom space on mobile for the fixed nav bar */}
        <main className="flex-1 min-h-0 min-w-0 relative overflow-y-auto bg-[#06132a] pb-16 lg:pb-0">{children}</main>
      </div>

      {/* Mobile bottom navigation (replaces the hamburger drawer) */}
      <AdminBottomNav />
    </div>
  );
}
