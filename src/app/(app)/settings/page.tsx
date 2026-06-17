'use client';

import { useApp } from '@/app/providers';
import { useScreenNav } from '@/lib/useScreenNav';
import Settings from '@/components/Settings';

export default function SettingsPage() {
  const { settings, updateSettings } = useApp();
  const navigate = useScreenNav();

  return (
    <Settings
      settings={settings}
      onNavigate={navigate}
      onUpdateSettings={updateSettings}
    />
  );
}
