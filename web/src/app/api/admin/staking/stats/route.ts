export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/session';

// GET /api/admin/staking/stats — per-coin staking liability overview.
//
// docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md §5.1 CUT-2 /
// T-5: reads StakePositionV2 (was StakePosition). `ledgeredInterest` now sums the
// V2 cached `ledgeredYield` column instead of v1's `paidInterest` — same meaning,
// renamed field (A-4 principle 6: cache/evidence split).
//
// `unpaidInterest` is the platform's REAL unfunded liability: interest that
// exists only in this Postgres ledger and has never been credited to any user's
// Nia-Hub balance. No payout rail exists (staking-payout-rail-prd.md §1);
// `hubSettled` is therefore a structural constant 0 — see DS-1.
// Do NOT reintroduce a field named "totalPaid": nothing here has been paid.
//
// admin-staking-debt-visibility-frd.md §3.

// DS-1: there is no column anywhere that tracks a real hub-side settlement
// total (schema.prisma has no `settledInterest`). `hubSettled` is therefore a
// *structural* zero, not a measurement — when a real payout rail exists
// (staking-yield-system-v2-prd.md §4), replace this constant with an actual
// column aggregate. This is the ONE place to change.
const HUB_SETTLED = '0';
const HUB_SETTLED_STATUS = 'NO_RAIL' as const;

// INV-1 (v1) watchdog no longer applies structurally in V2: StakePositionV2Status
// (schema.prisma) has exactly two members, ACTIVE and MATURED — there is no PAID
// value in the enum for any row to ever hold (rev03 rebuild note on the enum:
// "no PAID state ... is not carried forward"). A raw-SQL comparison of this
// column against the string 'PAID' would in fact error at the Postgres enum-cast
// level, not just return 0 rows — so this is a compile-time-guaranteed structural
// zero, stronger than v1's "never observed but not impossible" one. Kept as an
// explicit named constant (not silently dropped from the response) so the admin
// UI's existing INV-1 watchdog (StakingIncidentBanner / detectLiabilityIncidents)
// keeps working unchanged off a field that is now permanently 0.
const SETTLED_STATUS_COUNT = 0;

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
      COALESCE(SUM("ledgeredYield"::numeric), 0)::text AS "ledgeredInterest",
      -- unpaidInterest = ledgeredInterest − hubSettled, computed in SQL (never
      -- client-side subtraction of two decimal strings — CLAUDE.md rule 2).
      -- hubSettled is the structural constant 0 (see HUB_SETTLED above).
      (COALESCE(SUM("ledgeredYield"::numeric), 0) - 0)::text AS "unpaidInterest",
      COALESCE(SUM(CASE WHEN status = 'ACTIVE' THEN principal::numeric * "baseDailyRatePct"::numeric / 100 ELSE 0 END), 0)::text AS "dailyAccrualRate",
      COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS "activeCount",
      COUNT(*) FILTER (WHERE status = 'MATURED')::int AS "maturedCount",
      COUNT(*)::int AS "totalCount"
    FROM "StakePositionV2"
    GROUP BY coin
    ORDER BY coin
  `;

  const data = rows.map((r) => ({
    ...r,
    hubSettled: HUB_SETTLED,
    hubSettledStatus: HUB_SETTLED_STATUS,
    settledStatusCount: SETTLED_STATUS_COUNT,
  }));

  return NextResponse.json({ ok: true, data });
}
