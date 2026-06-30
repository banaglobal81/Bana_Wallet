export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { niaState } from '@/lib/nia/state';
import { recordAudit } from '@/lib/audit';
import { forwardWithdrawalToHub } from '@/lib/withdrawals';

/**
 * POST /api/admin/withdrawals/[id]/approve — approve a pending withdrawal (ADMIN only).
 * This is the point where funds actually leave: the stored request is forwarded to
 * Nia-Hub. On hub failure the request stays PENDING (with lastError) so it can be
 * retried; the idempotencyKey makes a retry safe against double-spend.
 */
export async function POST(
  _req: Request,
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
  const guardKey = `approve:${id}`;

  // Concurrency guard — only one approval can be in flight per request.
  if (niaState.inFlightWithdrawals.has(guardKey)) {
    return NextResponse.json({ ok: false, error: 'This withdrawal is already being processed' }, { status: 409 });
  }
  niaState.inFlightWithdrawals.add(guardKey);

  try {
    const wr = await prisma.withdrawalRequest.findUnique({ where: { id } });
    if (!wr) return NextResponse.json({ ok: false, error: 'Withdrawal not found' }, { status: 404 });
    if (wr.status !== 'PENDING') {
      return NextResponse.json({ ok: false, error: `Already ${wr.status.toLowerCase()}` }, { status: 409 });
    }

    // Forward to the hub — funds leave here (shared helper).
    const result = await forwardWithdrawalToHub(wr, { adminId });
    if (!result.ok) {
      // Hub rejected — request stays PENDING (lastError recorded) for retry.
      return NextResponse.json(
        { ok: false, error: `Hub rejected the withdrawal: ${result.error}` },
        { status: result.status ?? 502 },
      );
    }
    await recordAudit({
      adminId, adminEmail, action: 'WITHDRAWAL_APPROVE',
      targetType: 'withdrawal', targetId: id,
      detail: `${wr.amount} ${wr.currency} → ${wr.email}`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[admin/withdrawals/approve] error:', e);
    return NextResponse.json(
      { ok: false, error: 'Withdrawal service unavailable. Please try again later.' },
      { status: 503 },
    );
  } finally {
    niaState.inFlightWithdrawals.delete(guardKey);
  }
}
