export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/session';
import { settleMaturedPositions, serializePosition } from '@/lib/staking';

// GET /api/admin/staking/positions — all stake positions (oversight).
export async function GET(): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  await settleMaturedPositions();

  const rows = await prisma.stakePosition.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { product: { select: { name: true } } },
  });

  const data = rows.map((p) => ({
    ...serializePosition(p),
    email: p.email,
    productName: p.product?.name ?? '',
  }));
  return NextResponse.json({ ok: true, data });
}
