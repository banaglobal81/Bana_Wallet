export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { aprPct } from '@/lib/stakingMath';

// GET /api/staking/products — open staking products available to users.
export async function GET(): Promise<NextResponse> {
  try {
    await requireUser();
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  const products = await prisma.stakingProduct.findMany({
    where: { status: 'OPEN' },
    orderBy: { createdAt: 'desc' },
  });

  // Active staked totals per product (for capacity display).
  const active = await prisma.stakePosition.findMany({
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
      dailyRatePct: p.dailyRatePct, aprPct: aprPct(p.dailyRatePct).toFixed(2),
      minAmount: p.minAmount, maxAmount: p.maxAmount,
      capacity: p.capacity, remaining, full,
    };
  });
  return NextResponse.json({ ok: true, data });
}
