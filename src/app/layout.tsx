import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SessionProvider } from 'next-auth/react';
import { auth } from '@/auth';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'BANA Wallet — RWA & Healthcare',
  description: 'BANA Wallet — self-custody for RWA & Healthcare assets.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <html lang="en">
      <body className="antialiased">
        <SessionProvider session={session}>
          <Providers>{children}</Providers>
        </SessionProvider>
      </body>
    </html>
  );
}
