'use client';

import { useApp } from '@/app/providers';
import { useScreenNav } from '@/lib/useScreenNav';
import ActivityHistory from '@/components/ActivityHistory';

export default function ActivityPage() {
  const { activities, settings } = useApp();
  const navigate = useScreenNav();

  return <ActivityHistory activities={activities} settings={settings} onNavigate={navigate} />;
}
