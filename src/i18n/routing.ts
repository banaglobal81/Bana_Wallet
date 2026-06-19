import { defineRouting } from 'next-intl/routing';

// Supported locales. Each needs a matching messages/<locale>.json file.
// `localePrefix: 'always'` → every route lives under /<locale>/... ; '/' → /en.
export const routing = defineRouting({
  locales: ['en', 'ko', 'ja', 'zh', 'vi', 'th'],
  defaultLocale: 'en',
  localePrefix: 'always',
});

export type Locale = (typeof routing.locales)[number];

// Display metadata for the language switcher (native name + flag emoji).
export const LOCALE_LABELS: Record<Locale, { name: string; flag: string }> = {
  en: { name: 'English', flag: '🇺🇸' },
  ko: { name: '한국어', flag: '🇰🇷' },
  ja: { name: '日本語', flag: '🇯🇵' },
  zh: { name: '中文', flag: '🇨🇳' },
  vi: { name: 'Tiếng Việt', flag: '🇻🇳' },
  th: { name: 'ไทย', flag: '🇹🇭' },
};
