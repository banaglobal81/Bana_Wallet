export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/session';

// GET /api/admin/staking/stats — per-coin staking liability overview.
//
// `unpaidInterest` is the platform's REAL unfunded liability: interest that
// exists only in this Postgres ledger and has never been credited to any user's
// Nia-Hub balance. No payout rail exists (staking-payout-rail-prd.md §1);
// `hubSettled` is therefore a structural constant 0 — see DS-1.
// Do NOT reintroduce a field named "totalPaid": nothing here has been paid.
//
// admin-staking-debt-visibility-frd.md §3.

// DS-1: there is no column anywhere that tracks a real hub-side settlement
// total (schema.prisma has no `settledInterest`), and `StakePositionStatus.PAID`
// is never assigned by any code path (schema.prisma:36-40 — grep confirms).
// `hubSettled` is therefore a *structural* zero, not a measurement — when a
// real payout rail exists (staking-yield-system-v2-prd.md §4), replace this
// constant with an actual column aggregate. This is the ONE place to change.
const HUB_SETTLED = '0';
const HUB_SETTLED_STATUS = 'NO_RAIL' as const;

interface StatRow {
  coin: string;
  activePrincipal: string;
  grantedActivePrincipal: string;
  ledgeredInterest: string;
  unpaidInterest: string;
  dailyAccrualRate: string;
  activeCount: number;
  maturedCount: number;
  totalCount: number;
  // INV-1 watchdog (§3.4): expected to always be 0. If it ever becomes
  // non-zero, "Actually sent to wallets = 0" can no longer be trusted — the
  // UI must show an incident, not quietly render zero.
  settledStatusCount: number;
}

export async function GET(): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  const rows = await prisma.$queryRaw<StatRow[]>`
    SELECT coin,
      COALESCE(SUM(CASE WHEN status = 'ACTIVE' THEN principal::numeric ELSE 0 END), 0)::text AS "activePrincipal",
      COALESCE(SUM(CASE WHEN status = 'ACTIVE' AND "grantedByAdminId" IS NOT NULL THEN principal::numeric ELSE 0 END), 0)::text AS "grantedActivePrincipal",
      COALESCE(SUM("paidInterest"::numeric), 0)::text AS "ledgeredInterest",
      -- unpaidInterest = ledgeredInterest − hubSettled, computed in SQL (never
      -- client-side subtraction of two decimal strings — CLAUDE.md rule 2).
      -- hubSettled is the structural constant 0 (see HUB_SETTLED above).
      (COALESCE(SUM("paidInterest"::numeric), 0) - 0)::text AS "unpaidInterest",
      COALESCE(SUM(CASE WHEN status = 'ACTIVE' THEN principal::numeric * "dailyRatePct"::numeric / 100 ELSE 0 END), 0)::text AS "dailyAccrualRate",
      COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS "activeCount",
      COUNT(*) FILTER (WHERE status = 'MATURED')::int AS "maturedCount",
      COUNT(*)::int AS "totalCount",
      COUNT(*) FILTER (WHERE status = 'PAID')::int AS "settledStatusCount"
    FROM "StakePosition"
    GROUP BY coin
    ORDER BY coin
  `;

  const data = rows.map((r) => ({
    ...r,
    hubSettled: HUB_SETTLED,
    hubSettledStatus: HUB_SETTLED_STATUS,
  }));

  return NextResponse.json({ ok: true, data });
}
