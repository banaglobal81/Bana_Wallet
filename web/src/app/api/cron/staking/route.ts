export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db';
import { daysElapsed, dailyInterest } from '@/lib/stakingMath';

// POST /api/cron/staking — the daily settlement job, called by the worker.
// Protected by a shared secret (x-cron-secret). For every ACTIVE position it
// PAYS the interest earned for each elapsed day that hasn't been paid yet — one
// auditable row per day in StakingPayout — then flips matured positions to
// MATURED (which unlocks the principal). Idempotent: re-running pays nothing
// twice (days are tracked by daysPaid + a unique [positionId, dayIndex]).
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
  let daysCredited = 0;
  let totalPaid = new Decimal(0);

  const positions = await prisma.stakePosition.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true, userId: true, coin: true, principal: true,
      dailyRatePct: true, termDays: true, startAt: true, daysPaid: true,
    },
  });

  for (const p of positions) {
    // Whole days elapsed since start, capped at the lock term.
    const dueDays = daysElapsed(p.startAt, now, p.termDays);
    const perDay = dailyInterest(p.principal, p.dailyRatePct);
    const newDays = dueDays - p.daysPaid;

    if (newDays > 0) {
      // One ledger row per newly-owed day (skipDuplicates → safe re-runs).
      const rows = [];
      for (let d = p.daysPaid + 1; d <= dueDays; d += 1) {
        rows.push({ positionId: p.id, userId: p.userId, coin: p.coin, amount: perDay.toFixed(), dayIndex: d });
      }
      await prisma.stakingPayout.createMany({ data: rows, skipDuplicates: true });

      const paidToDate = perDay.times(dueDays);
      const isDone = dueDays >= p.termDays;
      await prisma.stakePosition.update({
        where: { id: p.id },
        data: {
          daysPaid: dueDays,
          paidInterest: paidToDate.toFixed(),
          accruedInterest: paidToDate.toFixed(),
          lastAccrualAt: now,
          ...(isDone ? { status: 'MATURED', paidAt: now } : {}),
        },
      });

      daysCredited += newDays;
      totalPaid = totalPaid.plus(perDay.times(newDays));
      if (isDone) matured += 1;
    } else if (dueDays >= p.termDays) {
      // Fully paid already but term ended and not yet flipped — settle it.
      await prisma.stakePosition.update({
        where: { id: p.id },
        data: { status: 'MATURED', paidAt: now, lastAccrualAt: now },
      });
      matured += 1;
    }
    processed += 1;
  }

  return NextResponse.json({
    ok: true,
    data: { processed, matured, daysCredited, totalPaid: totalPaid.toFixed(), at: now.toISOString() },
  });
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
