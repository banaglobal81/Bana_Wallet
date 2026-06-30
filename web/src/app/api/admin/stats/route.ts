export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { prisma } from '@/lib/db';

/**
 * GET /api/admin/stats — broker dashboard KPIs (ADMIN only). All from the local DB.
 */
export async function GET(): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [
      totalUsers, adminCount, disabledUsers, newUsers7d,
      pending, approved, rejected, failed,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'ADMIN' } }),
      prisma.user.count({ where: { disabled: true } }),
      prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.withdrawalRequest.count({ where: { status: 'PENDING' } }),
      prisma.withdrawalRequest.count({ where: { status: 'APPROVED' } }),
      prisma.withdrawalRequest.count({ where: { status: 'REJECTED' } }),
      prisma.withdrawalRequest.count({ where: { status: 'FAILED' } }),
    ]);

    return NextResponse.json({
      ok: true,
      data: {
        users: { total: totalUsers, admins: adminCount, disabled: disabledUsers, new7d: newUsers7d },
        withdrawals: { pending, approved, rejected, failed },
      },
    });
  } catch (e) {
    console.error('[admin/stats] database error:', e);
    return NextResponse.json(
      { ok: false, error: 'Service unavailable. Please try again later.' },
      { status: 503 },
    );
  }
}
