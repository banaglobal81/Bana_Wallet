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
    // ATOMIC CLAIM: flip PENDING -> PROCESSING in one statement. Only the caller
    // that wins this update may forward — a concurrent approve, a retry, or a
    // second replica sees count 0 and stops. This is the real double-forward
    // guard (the in-memory set above is only a per-process fast path).
    const claim = await prisma.withdrawalRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'PROCESSING', reviewedById: adminId ?? null, reviewedAt: new Date() },
    });
    if (claim.count === 0) {
      const existing = await prisma.withdrawalRequest.findUnique({ where: { id }, select: { status: true } });
      if (!existing) return NextResponse.json({ ok: false, error: 'Withdrawal not found' }, { status: 404 });
      return NextResponse.json({ ok: false, error: `Already ${existing.status.toLowerCase()}` }, { status: 409 });
    }
    const wr = (await prisma.withdrawalRequest.findUnique({ where: { id } }))!;

    // Forward to the hub — funds leave here (shared helper). On error the helper
    // marks the row FAILED (needs manual verification), never back to PENDING.
    const result = await forwardWithdrawalToHub(wr, { adminId });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: `Withdrawal could not be completed: ${result.error}. It is marked FAILED — verify on the hub before retrying.` },
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
