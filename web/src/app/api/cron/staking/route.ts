export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db';
import { accruedInterest, isMatured } from '@/lib/stakingMath';

// POST /api/cron/staking — daily accrual job, called by the worker.
// Protected by a shared secret (x-cron-secret header). For each ACTIVE position it
// recomputes the stored accrued interest (idempotent — safe to run repeatedly) and
// flips positions whose term has ended to MATURED.
export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 503 });
  }
  if (req.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  let processed = 0;
  let matured = 0;

  const positions = await prisma.stakePosition.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, principal: true, dailyRatePct: true, startAt: true, termDays: true, maturityAt: true },
  });

  for (const p of positions) {
    const accrued = accruedInterest(p.principal, p.dailyRatePct, p.startAt, p.termDays, now);
    const due = isMatured(p.maturityAt, now);
    await prisma.stakePosition.update({
      where: { id: p.id },
      data: {
        accruedInterest: accrued.toFixed(),
        lastAccrualAt: now,
        ...(due ? { status: 'MATURED' } : {}),
      },
    });
    processed += 1;
    if (due) matured += 1;
  }

  return NextResponse.json({ ok: true, data: { processed, matured, at: now.toISOString() } });
}

// GET — lightweight health/manual-check (still requires the secret).
export async function GET(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const active = await prisma.stakePosition.count({ where: { status: 'ACTIVE' } });
  return NextResponse.json({ ok: true, data: { activePositions: active } });
}
