export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { runStakingSettlement } from '@/lib/stakingSettle';

// POST /api/cron/staking — the daily settlement job, called by the worker.
// Protected by a shared secret (x-cron-secret). Delegates to the shared
// runStakingSettlement() (same logic as the admin "run now" action): pays each
// elapsed unpaid day into StakingPayout and matures ended positions. Idempotent.
export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 503 });
  }
  if (req.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runStakingSettlement(new Date());
  return NextResponse.json({ ok: true, data: result });
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
