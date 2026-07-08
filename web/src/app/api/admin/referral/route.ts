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

  // Platform-wide total across ALL earners — computed with its own un-LIMITed
  // aggregate. (Reducing over `earners` would only sum the top 50 shown above and
  // silently understate the true total once there are more than 50 earners.)
  const totalRow = await prisma.$queryRaw<Array<{ total: string }>>`
    SELECT COALESCE(SUM(total::numeric), 0)::text AS total FROM "ReferralBonusPayout"
  `;
  const grandTotal = new Decimal(totalRow[0]?.total || '0').toFixed();
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
