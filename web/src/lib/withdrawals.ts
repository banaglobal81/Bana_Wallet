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
 * actually leave. On success the row is marked APPROVED (with the hub reference);
 * on failure it stays in its current status with `lastError` recorded so it can be
 * retried. The stored idempotencyKey makes retries safe against double-spend.
 *
 * Shared by the admin approve route and the auto-approve path so the forwarding
 * logic lives in exactly one place.
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
  };
  if (wr.idempotencyKey) upstream.idempotencyKey = wr.idempotencyKey;

  try {
    const data = await niaWalletRequest('POST', '/api/v1/withdrawals', { body: upstream });
    const hubTxId =
      (data as { id?: string; withdrawalId?: string; txId?: string } | null)?.id ??
      (data as { withdrawalId?: string } | null)?.withdrawalId ??
      (data as { txId?: string } | null)?.txId ??
      null;
    await prisma.withdrawalRequest.update({
      where: { id: wr.id },
      data: { status: 'APPROVED', reviewedById: opts.adminId ?? null, reviewedAt: new Date(), hubTxId, lastError: null },
    });
    return { ok: true };
  } catch (e) {
    const err = e as Error & { status?: number };
    await prisma.withdrawalRequest.update({ where: { id: wr.id }, data: { lastError: err.message } });
    return { ok: false, error: err.message, status: err.status };
  }
}
