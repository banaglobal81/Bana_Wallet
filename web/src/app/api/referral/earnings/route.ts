export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { referralBonusEnabled } from '@/lib/referralBonus';

// GET /api/referral/earnings — the signed-in user's referral commission summary
// (대·소실적 매칭 + 유니레벨 부스트), from the ReferralBonusPayout ledger.
export async function GET(): Promise<NextResponse> {
  let userId: string;
  try {
    const me = (await requireUser()) as { id?: string };
    if (!me.id) throw Object.assign(new Error('Unauthorized'), { status: 401 });
    userId = me.id;
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  const rows = await prisma.referralBonusPayout.findMany({
    where: { userId },
    orderBy: { dayKey: 'desc' },
    select: { dayKey: true, layer1: true, layer2: true, total: true, coin: true, paidAt: true },
  });

  const sum = (key: 'layer1' | 'layer2' | 'total') =>
    rows.reduce((s, r) => s.plus(new Decimal(r[key] || '0')), new Decimal(0)).toFixed();

  return NextResponse.json({
    ok: true,
    data: {
      enabled: referralBonusEnabled(),
      coin: 'BANA',
      total: sum('total'),
      matching: sum('layer1'),   // 대·소실적 매칭
      boost: sum('layer2'),      // 유니레벨 부스트
      days: rows.length,
      recent: rows.slice(0, 10).map((r) => ({
        layer1: r.layer1, layer2: r.layer2, total: r.total, paidAt: r.paidAt.toISOString(),
      })),
    },
  });
}
