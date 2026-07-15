'use client';

import { useApp } from '@/app/providers';
import { useScreenNav } from '@/lib/useScreenNav';
import ActivityHistory from '@/components/ActivityHistory';

export default function ActivityPage() {
  const { settings } = useApp();
  const navigate = useScreenNav();

  return <ActivityHistory settings={settings} onNavigate={navigate} />;
}
