import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'BANA Wallet',
  description: 'BANA Wallet — self-custody for RWA & Healthcare assets.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
