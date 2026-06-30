import { getRequestConfig } from 'next-intl/server';
import { routing, type Locale } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!locale || !routing.locales.includes(locale as Locale)) {
    locale = routing.defaultLocale;
  }
  return {
    locale,
    // messages/ lives at the repo root → two levels up from src/i18n/
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
