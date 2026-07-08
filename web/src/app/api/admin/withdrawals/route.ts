export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { prisma } from '@/lib/db';

const STATUSES = ['PENDING', 'PROCESSING', 'APPROVED', 'REJECTED', 'FAILED'] as const;

/**
 * GET /api/admin/withdrawals — withdrawal approval queue (ADMIN only).
 * Optional ?status=PENDING|PROCESSING|APPROVED|REJECTED|FAILED filters; default returns all
 * (newest first, capped). Also returns the count of PENDING for the nav badge.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  const statusParam = req.nextUrl.searchParams.get('status') ?? '';
  const status = (STATUSES as readonly string[]).includes(statusParam)
    ? (statusParam as (typeof STATUSES)[number])
    : undefined;

  try {
    const [items, pendingCount] = await Promise.all([
      prisma.withdrawalRequest.findMany({
        where: status ? { status } : undefined,
        // Pending first (oldest at top — FIFO queue), then everything by recency.
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: 100,
      }),
      prisma.withdrawalRequest.count({ where: { status: 'PENDING' } }),
    ]);
    return NextResponse.json({ ok: true, data: { items, pendingCount } });
  } catch (e) {
    console.error('[admin/withdrawals] database error:', e);
    return NextResponse.json(
      { ok: false, error: 'Withdrawal service unavailable. Please try again later.' },
      { status: 503 },
    );
  }
}
