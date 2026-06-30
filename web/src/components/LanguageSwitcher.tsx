'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { Globe, Check } from 'lucide-react';
import { useRouter, usePathname } from '@/i18n/navigation';
import { routing, LOCALE_LABELS, type Locale } from '@/i18n/routing';

export default function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on click-outside / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (next: Locale) => {
    setOpen(false);
    if (next !== locale) {
      // Keep the same path, swap the locale prefix (next-intl handles the URL).
      router.replace(pathname, { locale: next });
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Change language"
        aria-haspopup="true"
        aria-expanded={open}
        className="p-2 rounded-xl border border-slate-700 bg-slate-800/40 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer"
      >
        <Globe className="h-5 w-5" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-700 bg-[#0b1830] shadow-2xl shadow-black/50 py-1.5 z-50">
          {routing.locales.map((loc) => {
            const { name, flag } = LOCALE_LABELS[loc];
            const active = loc === locale;
            return (
              <button
                key={loc}
                onClick={() => choose(loc)}
                className={`w-full flex items-center gap-3 px-3.5 py-2 text-sm transition-colors cursor-pointer ${
                  active ? 'text-[#528dff] font-semibold' : 'text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <span className="text-base leading-none">{flag}</span>
                <span className="flex-1 text-left">{name}</span>
                {active && <Check className="h-4 w-4 text-[#528dff]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
