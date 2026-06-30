'use client';

import { useApp } from '@/app/providers';
import { useScreenNav } from '@/lib/useScreenNav';
import Swap from '@/components/Swap';

export default function SwapPage() {
  const { settings } = useApp();
  const navigate = useScreenNav();

  return <Swap settings={settings} onNavigate={navigate} />;
}
