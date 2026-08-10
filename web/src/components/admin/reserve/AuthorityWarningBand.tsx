'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import type { SolvencyIncident } from '@/utils/adminApi';

// A-8 §8.2 — T1 (hub-listing detected) is deliberately NOT an incident. It is
// an expected event (the partner may list this coin in good faith) and
// mixing it into the rose incident banner trains operators to ignore the
// rose banner ("the once-a-week amber thing that's actually fine"). This is
// a SEPARATE, non-dismissable amber band — same "cannot be dismissed" rule
// (IN-2), different DOM component (IN-1), different color/tone (FB-7).
export function AuthorityWarningBand({ warnings }: { warnings: SolvencyIncident[] }) {
  const t = useTranslations('adminReserve.incident');

  if (!warnings || warnings.length === 0) return null;

  return (
    <div
      data-testid="authority-warning-band"
      role="status"
      className="flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-amber-100"
    >
      {warnings.map((w, i) => (
        <p key={`${w.code}-${w.coin}-${i}`} className="flex items-start gap-2 text-sm leading-relaxed">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-300" />
          <span>{t('AUTHORITY_T1', { coin: w.coin })}</span>
        </p>
      ))}
    </div>
  );
}
