'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';

// Shows a banner across the app when an admin has enabled maintenance mode.
// Reads the public /api/platform endpoint and re-checks periodically.
export default function MaintenanceBanner() {
  const t = useTranslations('common');
  const [on, setOn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = () =>
      fetch('/api/platform', { headers: { Accept: 'application/json' } })
        .then((r) => r.json())
        .then((d) => { if (!cancelled) setOn(Boolean(d?.data?.maintenanceMode)); })
        .catch(() => {});
    check();
    const id = setInterval(check, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (!on) return null;
  return (
    <div className="bg-amber-500/15 border-b border-amber-500/30 text-amber-300 text-xs font-semibold px-4 py-2 flex items-center justify-center gap-2 text-center">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      {t('maintenanceBanner')}
    </div>
  );
}
