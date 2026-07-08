import 'server-only';
import { prisma } from '@/lib/db';
import { niaWalletRequest } from '@/lib/nia/client';

type WithdrawalRow = {
  id: string;
  niaUserId: string;
  currency: string;
  network: string;
  amount: string;
  toAddress: string;
  idempotencyKey: string | null;
};

/**
 * Forward a stored withdrawal request to Nia-Hub — this is the point where funds
 * actually leave. The caller MUST have already atomically claimed the row
 * (status PENDING -> PROCESSING) so this can never run twice concurrently.
 *
 * Safety:
 *  - Always sends a stable idempotencyKey (the request id) so the hub can dedup
 *    a retry, in case the same request is ever forwarded twice.
 *  - On success -> APPROVED. On ANY error the outcome is UNKNOWN (the hub may
 *    have executed before the response was lost), so we mark the row FAILED with
 *    the error — NOT back to PENDING — so it is never blindly re-approved (which
 *    would risk a double-spend). An operator must verify against the hub before
 *    creating a new withdrawal.
 *
 * Shared by the admin approve route and the auto-approve path.
 */
export async function forwardWithdrawalToHub(
  wr: WithdrawalRow,
  opts: { adminId?: string | null } = {},
): Promise<{ ok: boolean; error?: string; status?: number }> {
  const upstream: Record<string, unknown> = {
    userId: wr.niaUserId,
    currency: wr.currency,
    network: wr.network,
    amount: wr.amount,
    toAddress: wr.toAddress,
    // Stable per-request key so a retry can be deduplicated hub-side.
    idempotencyKey: wr.idempotencyKey ?? wr.id,
  };

  try {
    const data = await niaWalletRequest('POST', '/api/v1/withdrawals', { body: upstream });
    const hubTxId =
      (data as { id?: string; withdrawalId?: string; txId?: string } | null)?.id ??
      (data as { withdrawalId?: string } | null)?.withdrawalId ??
      (data as { txId?: string } | null)?.txId ??
      null;
    // Only settle a row we still own (status PROCESSING). If an operator cleared a
    // "stuck" PROCESSING row (→ REJECTED) while this call was in flight, don't
    // clobber their decision.
    await prisma.withdrawalRequest.updateMany({
      where: { id: wr.id, status: 'PROCESSING' },
      data: { status: 'APPROVED', reviewedById: opts.adminId ?? null, reviewedAt: new Date(), hubTxId, lastError: null },
    });
    return { ok: true };
  } catch (e) {
    const err = e as Error & { status?: number };
    // Outcome unknown → FAILED (needs manual verification), never auto-retryable.
    // Guarded on PROCESSING for the same reason as the success path above.
    await prisma.withdrawalRequest.updateMany({
      where: { id: wr.id, status: 'PROCESSING' },
      data: { status: 'FAILED', lastError: err.message },
    });
    return { ok: false, error: err.message, status: err.status };
  }
}
