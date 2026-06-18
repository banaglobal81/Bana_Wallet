import { defineRouting } from 'next-intl/routing';

// Single locale for now ('en'). Add more by extending `locales` and dropping
// a matching messages/<locale>.json file. `localePrefix: 'always'` means every
// route lives under /<locale>/... (e.g. /en/portfolio); '/' redirects to /en.
export const routing = defineRouting({
  locales: ['en'],
  defaultLocale: 'en',
  localePrefix: 'always',
});

export type Locale = (typeof routing.locales)[number];
