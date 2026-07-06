export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit';
import { runStakingSettlement } from '@/lib/stakingSettle';

function adminErr(e: unknown) {
  const err = e as Error & { status?: number };
  return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
}

// POST /api/admin/staking/run — run the daily settlement now (admin-triggered).
// Same engine the cron worker uses; idempotent, so it's safe to press anytime.
export async function POST(): Promise<NextResponse> {
  let admin;
  try { admin = await requireAdmin(); } catch (e) { return adminErr(e); }

  const result = await runStakingSettlement(new Date());
  await recordAudit({
    adminId: (admin as { id?: string }).id, adminEmail: (admin as { email?: string }).email,
    action: 'STAKING_SETTLEMENT_RUN', targetType: 'staking', targetId: null,
    detail: `Ran settlement: ${result.daysCredited} day(s) credited, ${result.totalPaid} paid, ${result.matured} matured across ${result.processed} active position(s)`,
  });
  return NextResponse.json({ ok: true, data: result });
}

// GET /api/admin/staking/run — settlement status: when interest was last paid,
// how much was paid today, and how many positions are active.
export async function GET(): Promise<NextResponse> {
  try { await requireAdmin(); } catch (e) { return adminErr(e); }

  const last = await prisma.stakingPayout.findFirst({ orderBy: { paidAt: 'desc' }, select: { paidAt: true } });

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todays = await prisma.stakingPayout.findMany({
    where: { paidAt: { gte: startOfToday } },
    select: { amount: true },
  });
  const totalPaidToday = todays.reduce((sum, r) => sum.plus(new Decimal(r.amount)), new Decimal(0));

  const activeCount = await prisma.stakePosition.count({ where: { status: 'ACTIVE' } });

  return NextResponse.json({
    ok: true,
    data: {
      lastPayoutAt: last?.paidAt ? last.paidAt.toISOString() : null,
      payoutsToday: todays.length,
      totalPaidToday: totalPaidToday.toFixed(),
      activeCount,
    },
  });
}
