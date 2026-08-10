'use client';

import { useEffect, useState } from 'react';
import { getAdminCreditContext } from '@/utils/adminApi';

// T-16 AC-13 / AC-T16-01 — nav visibility for the admin balance-adjustment
// screen (AdminSidebar, AdminBottomNav, the Settings-page mobile shortcut) is
// fail-closed: the item must be absent while the kill-switch state is loading
// AND absent once it resolves to `false`/unknown, never rendered-then-removed
// (rev05a AC-13′; T-16 §3.4 — "메뉴는 은닉, 페이지는 정직").
//
// This is a nav-visibility signal ONLY. It never gates the /admin/credit page
// itself — that page always fetches its own full context (coins/limits) and
// renders an honest DISABLED/LOAD_FAILED state on direct URL entry (T-16 §3.4
// row 3 — 200, never 404/redirect).
export type AdminCreditGateStatus = 'unknown' | 'enabled' | 'disabled';

export function useAdminCreditGateStatus(): AdminCreditGateStatus {
  const [status, setStatus] = useState<AdminCreditGateStatus>('unknown');

  useEffect(() => {
    let cancelled = false;
    getAdminCreditContext()
      .then((ctx) => {
        if (cancelled) return;
        setStatus(ctx.state === 'ok' && ctx.enabled === true ? 'enabled' : 'disabled');
      })
      .catch(() => {
        if (!cancelled) setStatus('disabled');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
