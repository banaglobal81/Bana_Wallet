export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { settleMaturedPositions, serializePosition } from '@/lib/staking';

// GET /api/staking/positions — the signed-in user's stake positions.
export async function GET(): Promise<NextResponse> {
  let dbUserId: string;
  try {
    await requireUser();
    const u = (await auth())?.user as { id?: string } | undefined;
    if (!u?.id) throw Object.assign(new Error('Unauthorized'), { status: 401 });
    dbUserId = u.id;
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  await settleMaturedPositions(dbUserId);

  const rows = await prisma.stakePosition.findMany({
    where: { userId: dbUserId },
    orderBy: { createdAt: 'desc' },
    include: { product: { select: { name: true } } },
  });

  const data = rows.map((p) => ({ ...serializePosition(p), productName: p.product?.name ?? '' }));
  return NextResponse.json({ ok: true, data });
}
