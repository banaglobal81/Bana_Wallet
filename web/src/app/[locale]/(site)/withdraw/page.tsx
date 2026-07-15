'use client';

import { useApp } from '@/app/providers';
import { useScreenNav } from '@/lib/useScreenNav';
import Withdraw from '@/components/Withdraw';

export default function WithdrawPage() {
  const { settings } = useApp();
  const navigate = useScreenNav();

  return <Withdraw settings={settings} onNavigate={navigate} />;
}
