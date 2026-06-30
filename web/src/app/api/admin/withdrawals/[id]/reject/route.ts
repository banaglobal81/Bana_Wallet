export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { recordAudit } from '@/lib/audit';

/**
 * POST /api/admin/withdrawals/[id]/reject — reject a pending withdrawal (ADMIN only).
 * Body: { reason?: string }. No hub call — funds never leave.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let adminId: string | undefined;
  let adminEmail: string | undefined;
  try {
    const me = (await requireAdmin()) as { id?: string; email?: string };
    adminId = me.id;
    adminEmail = me.email;
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  const { id } = await params;
  let body: { reason?: unknown } = {};
  try { body = await req.json(); } catch { body = {}; }
  const reason = String(body.reason ?? '').trim().slice(0, 300) || null;

  try {
    // Atomic claim — only a PENDING request can be rejected.
    const claimed = await prisma.withdrawalRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'REJECTED', reviewedById: adminId, reviewedAt: new Date(), rejectionReason: reason },
    });
    if (claimed.count === 0) {
      const exists = await prisma.withdrawalRequest.findUnique({ where: { id }, select: { status: true } });
      if (!exists) return NextResponse.json({ ok: false, error: 'Withdrawal not found' }, { status: 404 });
      return NextResponse.json({ ok: false, error: `Already ${exists.status.toLowerCase()}` }, { status: 409 });
    }
    await recordAudit({
      adminId, adminEmail, action: 'WITHDRAWAL_REJECT',
      targetType: 'withdrawal', targetId: id, detail: reason ?? undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[admin/withdrawals/reject] error:', e);
    return NextResponse.json(
      { ok: false, error: 'Withdrawal service unavailable. Please try again later.' },
      { status: 503 },
    );
  }
}
