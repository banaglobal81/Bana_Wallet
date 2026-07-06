export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/session';
import { referralBonusEnabled } from '@/lib/referralBonus';

// GET /api/admin/referral — referral commission overview for the operator:
// total paid + top earners (matching + boost), and how many users have a downline.
export async function GET(): Promise<NextResponse> {
  try { await requireAdmin(); } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  const earners = await prisma.$queryRaw<
    Array<{ email: string; days: number; total: string; matching: string; boost: string }>
  >`
    SELECT u.email,
      COUNT(*)::int AS days,
      COALESCE(SUM(b.total::numeric), 0)::text  AS total,
      COALESCE(SUM(b.layer1::numeric), 0)::text AS matching,
      COALESCE(SUM(b.layer2::numeric), 0)::text AS boost
    FROM "ReferralBonusPayout" b
    JOIN "User" u ON u.id = b."userId"
    GROUP BY u.email
    ORDER BY SUM(b.total::numeric) DESC
    LIMIT 50
  `;

  const grandTotal = earners.reduce((s, r) => s.plus(new Decimal(r.total || '0')), new Decimal(0)).toFixed();
  const withDownline = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT COUNT(DISTINCT "referredById")::int AS n FROM "User" WHERE "referredById" IS NOT NULL
  `;

  return NextResponse.json({
    ok: true,
    data: {
      enabled: referralBonusEnabled(),
      grandTotal,
      uplines: withDownline[0]?.n ?? 0,
      earners,
    },
  });
}
