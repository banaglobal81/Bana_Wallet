'use client';

import { useState } from 'react';
import { usePathname } from '@/i18n/navigation';
import { Menu } from 'lucide-react';
import { useApp } from '@/app/providers';
import { useScreenNav, SCREEN_TO_PATH } from '@/lib/useScreenNav';
import Sidebar from '@/components/Sidebar';
import BanaLogo from '@/components/BanaLogo';
import Notifications from '@/components/Notifications';
import ProfileMenu from '@/components/ProfileMenu';
import type { Screen } from '@/types';

// Reverse-map path → Screen for sidebar highlighting.
const PATH_TO_SCREEN: Record<string, Screen> = Object.fromEntries(
  Object.entries(SCREEN_TO_PATH).map(([screen, path]) => [path, screen as Screen]),
);

function pathToScreen(pathname: string): Screen {
  return PATH_TO_SCREEN[pathname] ?? 'PORTFOLIO_DASHBOARD';
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { settings } = useApp();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navigate = useScreenNav();

  const navigateAndClose = (screen: Screen, direction?: string) => {
    setMobileNavOpen(false);
    navigate(screen, direction);
  };

  const currentScreen = pathToScreen(pathname);

  return (
    <div className="flex w-screen h-screen bg-[#06132a] text-[#d8e2ff] overflow-hidden leading-normal font-sans antialiased selection:bg-[#2E7DFF]/30 selection:text-white">
      {/* Sidebar — static on desktop, off-canvas drawer on mobile */}
      <Sidebar
        currentScreen={currentScreen}
        onNavigate={navigateAndClose}
        settings={settings}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      {/* Content column: top bar (mobile + desktop) + routed children */}
      <div className="flex-1 min-w-0 h-full flex flex-col">
        {/* Mobile-only top bar: brand + chrome + hamburger */}
        <header className="lg:hidden flex items-center justify-between gap-3 h-16 px-4 shrink-0 border-b border-slate-800 bg-[#06132a]/95 backdrop-blur z-20">
          <BanaLogo size="sm" />
          <div className="flex items-center gap-3">
            <Notifications />
            <ProfileMenu settings={settings} onNavigate={navigateAndClose} />
            <button
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="p-2.5 rounded-xl border border-slate-700 bg-slate-800/50 text-slate-200 hover:bg-slate-700 active:scale-95 transition-all cursor-pointer"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Desktop-only top bar: persistent chrome (Notifications + ProfileMenu),
            right-aligned in its own row so it never overlaps page headers. */}
        <header className="hidden lg:flex items-center justify-end gap-3 h-14 px-6 shrink-0 border-b border-slate-800/60 bg-[#06132a]/80 backdrop-blur z-20">
          <Notifications />
          <ProfileMenu settings={settings} onNavigate={navigateAndClose} />
        </header>

        {/* Main content area */}
        <main className="flex-1 min-w-0 relative overflow-hidden bg-[#06132a]">
          {children}
        </main>
      </div>
    </div>
  );
}
