'use client';

import { useApp } from '@/app/providers';
import { useScreenNav } from '@/lib/useScreenNav';
import Dashboard from '@/components/Dashboard';

export default function PortfolioPage() {
  const { settings } = useApp();
  const navigate = useScreenNav();

  return <Dashboard settings={settings} onNavigate={navigate} />;
}
