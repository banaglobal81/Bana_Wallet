export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { niaState } from '@/lib/nia/state';
import { recordAudit } from '@/lib/audit';
import { forwardWithdrawalToHub } from '@/lib/withdrawals';
import { transitionLocalWithdrawalToAwaitingOnchain } from '@/lib/withdrawalOnchain';
import { CoinAuthorityBlockedError } from '@/lib/coinAuthority';

/**
 * POST /api/admin/withdrawals/[id]/approve — approve a pending withdrawal (ADMIN only).
 *
 * HUB rail (balanceAuthorityAtRequest = 'HUB', the only rail that existed before
 * V2-CORE): unchanged — this is the point where funds actually leave. The request
 * is atomically claimed (PENDING -> PROCESSING) and forwarded to Nia-Hub. On hub
 * failure the row is marked FAILED (with lastError) — never auto-retried — because
 * the outcome is unknown and a blind retry could double-spend; an operator must
 * verify on the hub (and can then clear a stuck row via reject). The
 * idempotencyKey makes any hub-side retry safe.
 *
 * LOCAL rail (A-5 §1.5) — "approve" here means "execution intent confirmed", NOT
 * "funds moved". PROCESSING -> AWAITING_ONCHAIN. No funds leave in this branch —
 * the admin still has to execute the on-chain transfer outside this app and
 * submit the resulting txHash via POST .../submit-tx (A-5 §1.5 steps 1-10,
 * web/src/lib/withdrawalOnchain.ts submitWithdrawalOnchainTx()) before this
 * request ever reaches APPROVED.
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

    if (wr.balanceAuthorityAtRequest === 'LOCAL') {
      // LOCAL rail (A-5 §1.5) — no hub call, no funds move here.
      try {
        await transitionLocalWithdrawalToAwaitingOnchain(id, { adminId, adminEmail });
      } catch (e) {
        if (e instanceof CoinAuthorityBlockedError) {
          // assertExecutionAllowed() blocked (T2_HALTED / transition in progress) —
          // put the row back to PENDING so it doesn't sit stuck in PROCESSING
          // owned by nobody (A-5 §1.5 open question 1).
          await prisma.withdrawalRequest.updateMany({
            where: { id, status: 'PROCESSING' },
            data: { status: 'PENDING' },
          });
          return NextResponse.json({ ok: false, error: e.message }, { status: 409 });
        }
        throw e;
      }
      await recordAudit({
        adminId, adminEmail, action: 'WITHDRAWAL_APPROVE_QUEUED_ONCHAIN',
        targetType: 'withdrawal', targetId: id,
        detail: `${wr.debitTotal ?? wr.amount} ${wr.currency} — queued for manual on-chain execution`,
      });
      return NextResponse.json({ ok: true, data: { status: 'AWAITING_ONCHAIN' } });
    }

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
    return NextResponse.json({ ok: true, data: { status: 'APPROVED' } });
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
