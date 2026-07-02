export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';

// GET /api/staking/rewards — the user's earned staking-interest rewards ledger:
// total credited per coin (from the daily worker) + the most recent payouts.
export async function GET(): Promise<NextResponse> {
  let userId: string;
  try {
    await requireUser();
    const u = (await auth())?.user as { id?: string } | undefined;
    if (!u?.id) throw Object.assign(new Error('Unauthorized'), { status: 401 });
    userId = u.id;
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  const positions = await prisma.stakePosition.findMany({
    where: { userId },
    select: { coin: true, paidInterest: true },
  });
  const totalByCoin: Record<string, string> = {};
  for (const p of positions) {
    totalByCoin[p.coin] = new Decimal(totalByCoin[p.coin] ?? 0).plus(p.paidInterest || '0').toFixed();
  }

  const recent = await prisma.stakingPayout.findMany({
    where: { userId },
    orderBy: { paidAt: 'desc' },
    take: 20,
    select: { coin: true, amount: true, dayIndex: true, paidAt: true, positionId: true },
  });

  return NextResponse.json({
    ok: true,
    data: { totalByCoin, recent: recent.map((r) => ({ ...r, paidAt: r.paidAt.toISOString() })) },
  });
}
