export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { aprPct } from '@/lib/stakingMath';

// GET /api/staking/products — open V2 staking products available to users.
//
// docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md §5.2①
// (CUT-4 / T-7): `stakingProduct` -> `stakingProductV2`, response field
// `dailyRatePct` -> `baseDailyRatePct` (A-4 principle 3 — "이름이 의미를
// 정한다"), and capacity usage aggregated from `StakePositionV2`, not the
// legacy v1 table (which — per CS-1′/CS-2′ — holds 0 rows anyway, but this
// route must read the table that is actually kept current going forward).
export async function GET(): Promise<NextResponse> {
  try {
    await requireUser();
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  const products = await prisma.stakingProductV2.findMany({
    where: { status: 'OPEN' },
    orderBy: { createdAt: 'desc' },
  });

  // Active staked totals per product (for capacity display) — V2 positions only.
  const active = await prisma.stakePositionV2.findMany({
    where: { status: 'ACTIVE' },
    select: { productId: true, principal: true },
  });
  const staked = new Map<string, Decimal>();
  for (const p of active) {
    staked.set(p.productId, (staked.get(p.productId) ?? new Decimal(0)).plus(new Decimal(p.principal)));
  }

  const data = products.map((p) => {
    const used = staked.get(p.id) ?? new Decimal(0);
    const remaining = p.capacity ? Decimal.max(0, new Decimal(p.capacity).minus(used)).toFixed() : null;
    const full = p.capacity ? used.gte(new Decimal(p.capacity)) : false;
    return {
      id: p.id, coin: p.coin, name: p.name, termDays: p.termDays,
      baseDailyRatePct: p.baseDailyRatePct, aprPct: aprPct(p.baseDailyRatePct).toFixed(2),
      minAmount: p.minAmount, maxAmount: p.maxAmount,
      capacity: p.capacity, remaining, full,
    };
  });
  return NextResponse.json({ ok: true, data });
}
