import 'server-only';

// A-5 (V2-CORE) — WithdrawalRequest AWAITING_ONCHAIN state machine (LOCAL-authority
// rail only) + the submit-tx procedure that calls the read-only on-chain verifier.
// Design doc: docs/specs/staking-yield-system-v2-design-a5-withdrawal-queue.md §1.5.
//
// STATUS: this module is now wired into live request paths — see
// web/src/app/api/nia/withdrawals/route.ts,
// web/src/app/api/admin/withdrawals/[id]/approve/route.ts, and
// web/src/app/api/admin/withdrawals/[id]/submit-tx/route.ts. It is no longer dead
// code; the rev03 §7.2 condition ③ constraint this comment used to document applied
// only pre-wiring. The HUB rail (forwardWithdrawalToHub, web/src/lib/withdrawals.ts)
// remains untouched by this file, which only ever branches for
// balanceAuthorityAtRequest === 'LOCAL'.
//
// CLAUDE.md rule 2: all amount arithmetic uses decimal.js — never Number()/parseFloat.

import Decimal from 'decimal.js';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { getPlatformSettings } from '@/lib/platformSettings';
import { assertExecutionAllowed } from '@/lib/coinAuthority';
import { placeHold, executeHold } from '@/lib/localLedger';
import { verifyOnchainWithdrawal, isOnchainVerifyFailure } from '@/lib/onchain/verifyWithdrawal';
import {
  clampMinConfirmations,
  MIN_WITHDRAWAL_ONCHAIN_CONFIRMATIONS_FLOOR,
} from '../../server/core/onchain-verify.js';

export { MIN_WITHDRAWAL_ONCHAIN_CONFIRMATIONS_FLOOR };

// TODO: network-code -> EVM chainId belongs on ManagedCoin config (W-7-adjacent, coin
// management screen work — A-2/A-7 territory, out of this task's scope). Until that
// field exists, this is the one place the mapping lives, so it's easy to find later.
const NETWORK_CODE_TO_CHAIN_ID: Record<string, number> = {
  BINANCE: 56, // BSC mainnet
  BSC: 56,
};

// ---------------------------------------------------------------------------
// §3.2 — request-time hold (LOCAL rail). Wraps WithdrawalRequest creation + placeHold
// in one transaction, per A-5 §3.2's atomicity requirement.
// ---------------------------------------------------------------------------

export interface CreateLocalWithdrawalHoldInput {
  userId: string;
  niaUserId: string;
  email: string;
  coin: string;
  network: string;
  toAddress: string;
  amount: string; // on-chain transfer target (rev04 N-4)
  feeAmount: string; // platform fee, decimal string ("0" if none configured)
}

/**
 * A-5 §3.2. Creates the WithdrawalRequest row (balanceAuthorityAtRequest='LOCAL',
 * debitTotal = amount + feeAmount per rev04 N-4/N-5) and places the matching
 * WITHDRAWAL_PENDING hold, atomically. `getUserCoinBalance`'s availability check
 * happens inside placeHold() itself (A-3 §4.3) — this function does not duplicate it.
 */
export async function createLocalWithdrawalHold(input: CreateLocalWithdrawalHoldInput) {
  const debitTotal = new Decimal(input.amount).plus(new Decimal(input.feeAmount));

  return prisma.$transaction(async (tx) => {
    const wr = await tx.withdrawalRequest.create({
      data: {
        userId: input.userId,
        niaUserId: input.niaUserId,
        email: input.email,
        currency: input.coin,
        network: input.network,
        amount: input.amount,
        feeAmount: input.feeAmount,
        debitTotal: debitTotal.toFixed(),
        toAddress: input.toAddress,
        status: 'PENDING',
        balanceAuthorityAtRequest: 'LOCAL',
      },
    });

    const hold = await placeHold({
      tx,
      userId: input.userId,
      coin: input.coin,
      amount: debitTotal.toFixed(),
      reasonCode: 'WITHDRAWAL_PENDING',
      relatedType: 'WITHDRAWAL_REQUEST',
      relatedId: wr.id,
    });

    return tx.withdrawalRequest.update({ where: { id: wr.id }, data: { localHoldId: hold.id } });
  });
}

// ---------------------------------------------------------------------------
// §1.5 — approve-route LOCAL branch: PROCESSING -> AWAITING_ONCHAIN
// ---------------------------------------------------------------------------

/**
 * A-5 §1.5 LOCAL branch. The caller MUST have already atomically claimed the row
 * (PENDING -> PROCESSING, N-30 pattern) and confirmed balanceAuthorityAtRequest ===
 * 'LOCAL' before calling this — this function's own claim (PROCESSING ->
 * AWAITING_ONCHAIN) can never race because the caller already holds exclusive
 * ownership of the PROCESSING row. No funds move here — "approved" on this rail
 * means "execution intent confirmed", not "funds moved" (A-5 §1.2).
 */
export async function transitionLocalWithdrawalToAwaitingOnchain(
  withdrawalRequestId: string,
  opts: { adminId?: string | null; adminEmail?: string | null } = {},
): Promise<void> {
  const wr = await prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: withdrawalRequestId } });
  if (wr.balanceAuthorityAtRequest !== 'LOCAL') {
    throw new Error(
      `transitionLocalWithdrawalToAwaitingOnchain: ${withdrawalRequestId} has balanceAuthorityAtRequest=${wr.balanceAuthorityAtRequest}, not LOCAL.`,
    );
  }

  await assertExecutionAllowed(wr.currency, 'WITHDRAWAL');

  const claim = await prisma.withdrawalRequest.updateMany({
    where: { id: withdrawalRequestId, status: 'PROCESSING' },
    data: { status: 'AWAITING_ONCHAIN' },
  });
  if (claim.count !== 1) {
    throw new Error(`transitionLocalWithdrawalToAwaitingOnchain: ${withdrawalRequestId} was not PROCESSING — atomic claim failed.`);
  }

  await recordAudit({
    adminId: opts.adminId,
    adminEmail: opts.adminEmail,
    action: 'WITHDRAWAL_APPROVE_QUEUED_ONCHAIN',
    targetType: 'withdrawal',
    targetId: withdrawalRequestId,
    detail: `${wr.debitTotal ?? wr.amount} ${wr.currency} — queued for manual on-chain execution (LOCAL rail)`,
  });
}

// ---------------------------------------------------------------------------
// §1.5 steps 1-10 — submit-tx
// ---------------------------------------------------------------------------

export type SubmitWithdrawalOnchainTxOutcome =
  | { ok: true }
  | { ok: false; error: string; reason: string };

/**
 * A-5 §1.5 steps 1-10 (submit-tx). Verifies the admin-submitted txHash against the
 * chain via the read-only verifyOnchainWithdrawal() helper (W-4 — the txHash is an
 * unverified claim until this passes) and, only on a pass, atomically (1) records
 * WithdrawalOnchainSettlement (the (chainId, txHash) unique constraint is the final
 * W-6 reuse-prevention defense), (2) executes the hold (the actual burn, via A-3's
 * executeHold), and (3) flips AWAITING_ONCHAIN -> APPROVED. On any failure/uncertain
 * outcome, WithdrawalRequest.status is left untouched (W-5 — never auto-FAILED) and
 * the attempt is recorded as its own evidence row.
 */
export async function submitWithdrawalOnchainTx(
  withdrawalRequestId: string,
  txHash: string,
  opts: { adminId: string },
): Promise<SubmitWithdrawalOnchainTxOutcome> {
  const wr = await prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: withdrawalRequestId } });
  if (wr.status !== 'AWAITING_ONCHAIN' || wr.balanceAuthorityAtRequest !== 'LOCAL') {
    return {
      ok: false,
      error: `Withdrawal ${withdrawalRequestId} is not AWAITING_ONCHAIN on the LOCAL rail (status=${wr.status}, authority=${wr.balanceAuthorityAtRequest}).`,
      reason: 'INVALID_STATE',
    };
  }

  // Step 4 — re-confirm execution is still allowed (time has passed since approval).
  await assertExecutionAllowed(wr.currency, 'WITHDRAWAL');

  // Step 5 — coin network config (ManagedCoin.networks[] matching currency+network).
  const managedCoin = await prisma.managedCoin.findUnique({ where: { symbol: wr.currency } });
  const networks = Array.isArray(managedCoin?.networks) ? (managedCoin!.networks as unknown as Array<Record<string, unknown>>) : [];
  const netConfig = networks.find((n) => String(n.code ?? '').toUpperCase() === wr.network.toUpperCase());
  if (!netConfig) {
    return {
      ok: false,
      error: `No network config found for ${wr.currency} on ${wr.network}.`,
      reason: 'NETWORK_CONFIG_MISSING',
    };
  }
  const chainId = NETWORK_CODE_TO_CHAIN_ID[wr.network.toUpperCase()];
  if (!chainId) {
    return { ok: false, error: `No chainId mapping for network code ${wr.network}.`, reason: 'NETWORK_CONFIG_MISSING' };
  }

  // Step 6 — floor-clamp minConfirmations (A-5 §2.6 strike point 2, fail-closed).
  const settings = await getPlatformSettings();
  const { value: minConfirmations, clamped } = clampMinConfirmations(settings.withdrawalOnchainMinConfirmations);
  if (clamped) {
    await recordAudit({
      action: 'WITHDRAWAL_ONCHAIN_MIN_CONFIRMATIONS_FLOOR_APPLIED',
      targetType: 'withdrawal',
      targetId: withdrawalRequestId,
      detail: `configured=${settings.withdrawalOnchainMinConfirmations}`,
    });
  }

  // Step 7 — read-only on-chain verification (W-4).
  const debitOrAmount = wr.amount; // amount = on-chain transfer target (rev04 N-4), not debitTotal
  const outcome = await verifyOnchainWithdrawal({
    chainId,
    contractAddress: String(netConfig.contractAddress ?? ''),
    expectedToAddress: wr.toAddress,
    expectedAmount: debitOrAmount,
    tokenDecimals: Number(netConfig.decimals ?? 18),
    txHash,
    minConfirmations,
  });

  // Step 8 — record the attempt (evidence row, regardless of outcome — W-5).
  // (isOnchainVerifyFailure — a type-predicate guard, not bare `outcome.ok` control
  // flow — see the note in src/lib/onchain/verifyWithdrawal.ts on why.)
  await prisma.withdrawalOnchainVerificationAttempt.create({
    data: {
      withdrawalRequestId,
      submittedTxHash: txHash,
      result: isOnchainVerifyFailure(outcome) ? outcome.reason : 'PASS',
      detail: isOnchainVerifyFailure(outcome) ? outcome.detail : null,
      confirmationsAtCheck: isOnchainVerifyFailure(outcome) ? (outcome.confirmations ?? null) : outcome.confirmations,
      checkedByAdminId: opts.adminId,
    },
  });

  // Step 9 — not ok: status stays AWAITING_ONCHAIN (W-5), report the reason verbatim.
  if (isOnchainVerifyFailure(outcome)) {
    await recordAudit({
      adminId: opts.adminId,
      action: 'WITHDRAWAL_ONCHAIN_VERIFY_FAILED',
      targetType: 'withdrawal',
      targetId: withdrawalRequestId,
      detail: outcome.reason,
    });
    return { ok: false, error: outcome.detail, reason: outcome.reason };
  }

  // Step 10 — ok: settle atomically (settlement row, hold execution, status flip).
  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.withdrawalOnchainSettlement.create({
        data: {
          withdrawalRequestId,
          chainId,
          txHash,
          observedAmount: outcome.observedAmount,
        },
      });

      if (!wr.localHoldId) {
        throw new Error(`Withdrawal ${withdrawalRequestId} has no localHoldId — cannot execute the hold.`);
      }
      await executeHold(wr.localHoldId, {
        tx,
        reasonCode: 'WITHDRAWAL_EXECUTED',
        idempotencyKey: `WITHDRAWAL_EXECUTED:${wr.id}`,
        relatedType: 'WITHDRAWAL_REQUEST',
        relatedId: wr.id,
      });

      const claim = await tx.withdrawalRequest.updateMany({
        where: { id: withdrawalRequestId, status: 'AWAITING_ONCHAIN' },
        data: { status: 'APPROVED', onchainTxHash: txHash, onchainChainId: chainId, onchainVerifiedAt: new Date() },
      });
      if (claim.count !== 1) {
        throw new Error(`Withdrawal ${withdrawalRequestId} was not AWAITING_ONCHAIN at settlement time — concurrent submit-tx?`);
      }
    });
  } catch (e) {
    const err = e as Error & { code?: string; meta?: { target?: string[] } };
    // Prisma P2002 = unique constraint violation. The (chainId, txHash) unique index
    // is the W-6 final defense — a second request trying to settle off the same
    // on-chain transfer lands here.
    if (err.code === 'P2002') {
      await recordAudit({
        adminId: opts.adminId,
        action: 'WITHDRAWAL_ONCHAIN_VERIFY_FAILED',
        targetType: 'withdrawal',
        targetId: withdrawalRequestId,
        detail: 'TX_ALREADY_CONSUMED',
      });
      return {
        ok: false,
        error: `Transaction ${txHash} has already been used to settle a different withdrawal request.`,
        reason: 'TX_ALREADY_CONSUMED',
      };
    }
    throw e;
  }

  await recordAudit({
    adminId: opts.adminId,
    action: 'WITHDRAWAL_ONCHAIN_VERIFIED',
    targetType: 'withdrawal',
    targetId: withdrawalRequestId,
    detail: `${wr.amount} ${wr.currency} · tx ${txHash}`,
  });
  return { ok: true };
}
