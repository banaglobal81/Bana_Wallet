import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { SessionProvider } from 'next-auth/react';
import { ThemeProvider } from 'next-themes';
import { auth } from '@/auth';
import { routing } from '@/i18n/routing';
import { Providers } from '../providers';
import BanaBackground from '@/components/BanaBackground';
import '../globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const session = await auth();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          {/* Mounted once here, never per-page: WebGL contexts are expensive
              and browsers cap how many can be live at once. */}
          <BanaBackground />
          <NextIntlClientProvider>
            <SessionProvider session={session}>
              <Providers>{children}</Providers>
            </SessionProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
