'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { Download, Upload } from 'lucide-react';

// Left sub-navigation for the deposit/withdraw flows (crypto only).
export default function FlowNav() {
  const t = useTranslations('walletFlow');
  const pathname = usePathname();

  const items = [
    { key: 'depositCrypto', href: '/deposit', icon: Download, enabled: true },
    { key: 'withdrawCrypto', href: '/withdraw', icon: Upload, enabled: true },
  ] as const;

  return (
    <nav className="flex flex-row lg:flex-col gap-1.5 lg:w-56 shrink-0 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
      {items.map(({ key, href, icon: Icon, enabled }) => {
        const active = enabled && pathname === href;
        const base =
          'flex items-center gap-2.5 px-3.5 py-3 rounded-xl text-sm font-semibold transition-colors shrink-0 whitespace-nowrap';
        if (!enabled) {
          return (
            <div key={key} className={`${base} text-[#56607a] cursor-not-allowed`}>
              <Icon className="h-5 w-5 shrink-0" />
              <span>{t(key)}</span>
              <span className="ml-auto text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#1E3559]/60 text-[#8c90a0] uppercase tracking-wide">
                {t('soon')}
              </span>
            </div>
          );
        }
        return (
          <Link
            key={key}
            href={href}
            className={`${base} ${active ? 'bg-[#16325c] text-white' : 'text-[#8c90a0] hover:text-white hover:bg-[#112643]/60'}`}
          >
            <Icon className={`h-5 w-5 shrink-0 ${active ? 'text-[#528dff]' : ''}`} />
            <span>{t(key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
