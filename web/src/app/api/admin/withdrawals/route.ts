export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { getUserAdminAdjustmentNet } from '@/lib/localLedger';

const STATUSES = ['PENDING', 'PROCESSING', 'AWAITING_ONCHAIN', 'APPROVED', 'REJECTED', 'FAILED'] as const;

/**
 * GET /api/admin/withdrawals — withdrawal approval queue (ADMIN only).
 * Optional ?status=PENDING|PROCESSING|AWAITING_ONCHAIN|APPROVED|REJECTED|FAILED
 * filters; default returns all (newest first, capped). Also returns the count
 * of PENDING for the nav badge.
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
        // A-5 W-9 — the admin queue must show the LOCAL rail's verification
        // evidence (§2.5) alongside the request, not just the current status.
        include: { onchainVerificationAttempts: { orderBy: { checkedAt: 'desc' } } },
      }),
      prisma.withdrawalRequest.count({ where: { status: 'PENDING' } }),
    ]);

    // T-16 §8 (DC-9, AC-10) — admin-adjustment net-credit marker per row. Computed
    // once per unique (userId, coin) pair in this page (never per-row-N+1 against
    // the same pair). A failure for one pair must not fail the whole queue load,
    // and must never silently become "0" — null propagates to the client as
    // "couldn't compute" (the UI renders a distinct 4th state for that, §8.2).
    const pairs = Array.from(new Set(items.map((w) => `${w.userId}::${w.currency}`)));
    const netByPair = new Map<string, string | null>();
    await Promise.all(
      pairs.map(async (key) => {
        const [userId, coin] = key.split('::');
        try {
          netByPair.set(key, await getUserAdminAdjustmentNet(userId, coin));
        } catch (e) {
          console.error('[admin/withdrawals] adminAdjustmentNetCredit lookup failed:', e);
          netByPair.set(key, null);
        }
      }),
    );
    const itemsWithMarker = items.map((w) => ({
      ...w,
      adminAdjustmentNetCredit: netByPair.get(`${w.userId}::${w.currency}`) ?? null,
    }));

    return NextResponse.json({ ok: true, data: { items: itemsWithMarker, pendingCount } });
  } catch (e) {
    console.error('[admin/withdrawals] database error:', e);
    return NextResponse.json(
      { ok: false, error: 'Withdrawal service unavailable. Please try again later.' },
      { status: 503 },
    );
  }
}
