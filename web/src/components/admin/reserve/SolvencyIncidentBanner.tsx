'use client';

import { useTranslations } from 'next-intl';
import { AlertOctagon } from 'lucide-react';
import type { SolvencyIncident } from '@/utils/adminApi';

// A-8 §8 — "닫을 수 없는 로즈 인시던트 배너는 '지금 자금이 위험하거나, 자금이
// 안전하다는 주장의 근거가 무너졌다'에만 준다." Every incident is rendered in
// full (IN-3 — no "+N more" collapsing) and there is deliberately no dismiss/
// close control anywhere in this component (IN-2/PR-11).
//
// Judgement is server-side (IN-5) — this component only renders what
// GET /api/admin/solvency's top-level `incidents[]` already decided.

const KNOWN_CODES = new Set([
  'POR_FAIL',
  'AUTHORITY_T2',
  'HOLD_INVARIANT_BROKEN',
  'HUB_COIN_HAS_LOCAL_BALANCE',
  'ISSUING_WITHOUT_VERIFICATION',
]);

export function SolvencyIncidentBanner({ incidents }: { incidents: SolvencyIncident[] }) {
  const t = useTranslations('adminReserve.incident');

  if (!incidents || incidents.length === 0) return null;

  return (
    <div
      data-testid="solvency-incident"
      role="alert"
      className="flex flex-col gap-3 rounded-xl border border-rose-500/40 bg-rose-500/15 px-4 py-3.5 text-rose-100"
    >
      {incidents.map((inc, i) => (
        <p key={`${inc.code}-${inc.coin}-${i}`} className="flex items-start gap-2 text-sm leading-relaxed">
          <AlertOctagon className="h-4 w-4 shrink-0 mt-0.5 text-rose-300" />
          <span>
            {KNOWN_CODES.has(inc.code)
              ? t(inc.code as 'POR_FAIL', {
                  coin: inc.coin,
                  runId: (inc.runId as string) ?? '',
                  left: (inc.leftTotal as string) ?? '',
                  right: (inc.rightTotal as string) ?? '',
                  n: (inc.mismatchCount as number) ?? 0,
                  holds: (inc.holds as string) ?? '',
                  requests: (inc.requests as string) ?? '',
                  state: (inc.state as string) ?? '',
                })
              : t('UNKNOWN_CODE', { code: inc.code })}
          </span>
        </p>
      ))}
    </div>
  );
}
