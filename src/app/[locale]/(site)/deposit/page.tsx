'use client';

import { useApp } from '@/app/providers';
import { useScreenNav } from '@/lib/useScreenNav';
import Deposit from '@/components/Deposit';

export default function DepositPage() {
  const { assets, settings } = useApp();
  const navigate = useScreenNav();

  return <Deposit assets={assets} settings={settings} onNavigate={navigate} />;
}
