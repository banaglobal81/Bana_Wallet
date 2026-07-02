export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/session';

// GET /api/admin/staking/stats — per-coin staking liability overview for the
// operator: active locked principal, interest actually paid to date (the real
// StakingPayout ledger), and position counts.
export async function GET(): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  const rows = await prisma.$queryRaw<
    Array<{ coin: string; activePrincipal: string; totalPaid: string; activeCount: number; totalCount: number }>
  >`
    SELECT coin,
      COALESCE(SUM(CASE WHEN status = 'ACTIVE' THEN principal::numeric ELSE 0 END), 0)::text AS "activePrincipal",
      COALESCE(SUM("paidInterest"::numeric), 0)::text AS "totalPaid",
      COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS "activeCount",
      COUNT(*)::int AS "totalCount"
    FROM "StakePosition"
    GROUP BY coin
    ORDER BY coin
  `;

  return NextResponse.json({ ok: true, data: rows });
}
