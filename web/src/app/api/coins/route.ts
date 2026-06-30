export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';

// GET /api/coins — admin-managed coins visible to users (custom EVM tokens).
// These are merged into the deposit/withdraw coin lists on the client.
export async function GET(): Promise<NextResponse> {
  try {
    await requireUser();
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  const coins = await prisma.managedCoin.findMany({
    where: { visible: true },
    orderBy: { createdAt: 'desc' },
    select: { symbol: true, name: true, networks: true, logoKey: true },
  });
  return NextResponse.json({ ok: true, data: coins });
}
