'use client';

import { useApp } from '@/app/providers';
import { useScreenNav } from '@/lib/useScreenNav';
import Staking from '@/components/Staking';

export default function StakingPage() {
  const { settings } = useApp();
  const navigate = useScreenNav();

  return <Staking settings={settings} onNavigate={navigate} />;
}
