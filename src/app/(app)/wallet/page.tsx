'use client';

import { useApp } from '@/app/providers';
import { useScreenNav } from '@/lib/useScreenNav';
import Wallet from '@/components/Wallet';

export default function WalletPage() {
  const { settings } = useApp();
  const navigate = useScreenNav();

  return <Wallet settings={settings} onNavigate={navigate} />;
}
