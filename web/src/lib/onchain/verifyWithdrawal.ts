import 'server-only';

// A-5 §2 — read-only on-chain withdrawal verification helper.
// docs/specs/staking-yield-system-v2-design-a5-withdrawal-queue.md §2.2/§2.3/§2.4.
//
// Harness split (same pattern as nia-signing.js / client.ts, see
// docs/architecture/harness.md): pure decoding/comparison logic lives in
// server/core/onchain-verify.js; this file owns the real dependency (fetch/JSON-RPC).
//
// STATUS (per the task that produced this file): the function signature, failure-
// reason taxonomy, and full step-by-step orchestration below are complete and match
// A-5 §2.3/§2.4 exactly. The actual JSON-RPC network calls (fetchTransactionReceipt /
// fetchTransactionByHash / fetchBlockNumber) are TODO stubs — see each function.
// Any network error (including "not implemented yet") is caught by the outer
// try/catch and reported as RPC_UNAVAILABLE ("couldn't verify", never a false
// WRONG_CONTRACT/AMOUNT_MISMATCH/etc — A-5 §2.4 closing paragraph), so this module is
// safe to import/exist without ever producing a false-positive "verified" outcome.
//
// SECURITY (A-5 §2.1/§4): read-only only. No eth_sendRawTransaction / personal_sign /
// signing/private-key/mnemonic code may ever be added to this file tree. Every change
// here requires a wallet-security-expert review (A-5 §2.2).
// REACHABILITY: this module is now imported transitively via
// web/src/lib/withdrawalOnchain.ts, which web/src/app/api/admin/withdrawals/[id]/submit-tx/route.ts
// calls on a live request path. It is no longer dead/unreachable code — though the
// JSON-RPC stubs noted above are still TODO, so it always resolves RPC_UNAVAILABLE
// until those are implemented (never a false-positive "verified" outcome).

import Decimal from 'decimal.js';
import {
  clampMinConfirmations,
  computeConfirmations,
  filterTransferLogs,
  findRecipientMatch,
  amountsMatchExactly,
} from '../../../server/core/onchain-verify.js';
import { BSC_RPC_URL } from './config';

export interface OnchainVerifyInput {
  /** e.g. 56 = BSC mainnet. Mapped from ManagedCoin.networks[] by code, not hardcoded. */
  chainId: number;
  /** Expected BEP-20 contract address (DP-3) — from ManagedCoin config, not a literal. */
  contractAddress: string;
  /** WithdrawalRequest.toAddress. */
  expectedToAddress: string;
  /** decimal string. WithdrawalRequest.amount (the on-chain transfer target — A-7 §5.3/rev04 N-4). */
  expectedAmount: string;
  /** Contract decimals (from config — e.g. 18 for BANA, N-14). */
  tokenDecimals: number;
  /** Admin-submitted value — treated as an unverified claim until this function passes (W-4). */
  txHash: string;
  /** From PlatformSetting.withdrawalOnchainMinConfirmations, already floor-clamped by the
   *  caller (A-5 §2.6 strike point 2). Re-clamped here too — idempotent, defense-in-depth. */
  minConfirmations: number;
}

export type OnchainVerifyFailureReason =
  | 'TX_NOT_FOUND' // not found anywhere, not even the mempool
  | 'TX_PENDING' // in the mempool, no receipt yet — transient
  | 'TX_REVERTED' // receipt.status !== success
  | 'NO_TRANSFER_EVENT' // no ERC20/BEP20 Transfer log at all in the receipt
  | 'WRONG_CONTRACT' // Transfer log(s) exist, but not on the expected contract (DP-3)
  | 'WRONG_RECIPIENT' // no matching `to` among the contract's Transfer logs
  | 'AMOUNT_MISMATCH' // exact-match failure (no float/epsilon tolerance)
  | 'INSUFFICIENT_CONFIRMATIONS' // everything else matches, just not confirmed deep enough yet
  // Filled in by the CALLER (the DB unique-constraint violation on
  // WithdrawalOnchainSettlement), never by this function — see the note below.
  | 'TX_ALREADY_CONSUMED'
  | 'RPC_UNAVAILABLE'; // could not verify at all — not a verdict, a fault (A-5 §2.4 principle 3)

export type OnchainVerifyOutcome =
  | { ok: true; confirmations: number; blockNumber: number; observedAmount: string }
  | { ok: false; reason: OnchainVerifyFailureReason; detail: string; confirmations?: number };

// tsconfig.json's "strict": false (strictNullChecks off) does not reliably narrow a
// discriminated union via plain `if (!outcome.ok)` control flow in this codebase
// (verified reproducible) — callers must use this type-predicate guard instead of
// branching on `.ok` directly. See the identical note in src/lib/localLedger.ts.
export function isOnchainVerifyFailure(o: OnchainVerifyOutcome): o is Extract<OnchainVerifyOutcome, { ok: false }> {
  return o.ok === false;
}

// ---------------------------------------------------------------------------
// TODO (real RPC wiring — deferred to a follow-up task, see A-5 §2.8/§8 item 1).
// Each of these is a read-only JSON-RPC call. Library choice (raw fetch vs viem
// read-only client) is undecided — A-5 §2.8 explicitly leaves it open, to be
// decided with wallet-security-expert at implementation time.
// ---------------------------------------------------------------------------

interface JsonRpcTransactionReceipt {
  status: string; // '0x1' | '0x0'
  blockNumber: string; // hex
  logs: Array<{ address: string; topics: string[]; data: string }>;
}

/** TODO: eth_getTransactionReceipt via BSC_RPC_URL. Returns null if not found. */
async function fetchTransactionReceipt(_txHash: string): Promise<JsonRpcTransactionReceipt | null> {
  throw new Error(
    `TODO(A-5 §2.8): eth_getTransactionReceipt not implemented yet (BSC_RPC_URL=${BSC_RPC_URL || '<unset>'})`,
  );
}

/** TODO: eth_getTransactionByHash via BSC_RPC_URL. Returns null if not found anywhere (not even the mempool). */
async function fetchTransactionByHash(_txHash: string): Promise<unknown | null> {
  throw new Error('TODO(A-5 §2.8): eth_getTransactionByHash not implemented yet');
}

/** TODO: eth_blockNumber via BSC_RPC_URL. */
async function fetchBlockNumber(): Promise<number> {
  throw new Error('TODO(A-5 §2.8): eth_blockNumber not implemented yet');
}

// ---------------------------------------------------------------------------
// Orchestration — A-5 §2.4 steps 1-8, complete.
// ---------------------------------------------------------------------------

/**
 * Read-only, stateless on-chain withdrawal verification (A-5 §2). Never signs or
 * sends a transaction. Never touches the database — `TX_ALREADY_CONSUMED` is filled
 * in by the caller after this function returns `ok: true` and the caller's DB insert
 * into WithdrawalOnchainSettlement hits the (chainId, txHash) unique constraint
 * (A-5 §2.3 closing note, §2.9).
 */
export async function verifyOnchainWithdrawal(input: OnchainVerifyInput): Promise<OnchainVerifyOutcome> {
  const { value: minConfirmations } = clampMinConfirmations(input.minConfirmations);

  try {
    // Step 1 — receipt lookup, falling back to a mempool check to distinguish
    // "pending" from "not found at all".
    const receipt = await fetchTransactionReceipt(input.txHash);
    if (!receipt) {
      const mempoolTx = await fetchTransactionByHash(input.txHash);
      if (mempoolTx) {
        return { ok: false, reason: 'TX_PENDING', detail: 'Transaction is in the mempool, not yet mined.' };
      }
      return { ok: false, reason: 'TX_NOT_FOUND', detail: `No transaction found for hash ${input.txHash}.` };
    }

    // Step 2 — reverted transactions never pass, regardless of any log content.
    if (receipt.status !== '0x1') {
      return { ok: false, reason: 'TX_REVERTED', detail: 'Transaction receipt status is not success (reverted).' };
    }

    // Steps 3-4 — Transfer-log candidates on the expected contract.
    const { candidates, contractMismatch } = filterTransferLogs(receipt.logs, input.contractAddress);
    if (contractMismatch) {
      return {
        ok: false,
        reason: 'WRONG_CONTRACT',
        detail: `Transfer event(s) found, but not on the expected contract ${input.contractAddress}.`,
      };
    }
    if (candidates.length === 0) {
      return {
        ok: false,
        reason: 'NO_TRANSFER_EVENT',
        detail: 'Receipt has no ERC20/BEP20 Transfer log (e.g. a native-coin transfer submitted by mistake).',
      };
    }

    // Step 5 — recipient match. A single log must match exactly (no aggregation).
    const match = findRecipientMatch(candidates, input.expectedToAddress);
    if (!match) {
      return {
        ok: false,
        reason: 'WRONG_RECIPIENT',
        detail: `No Transfer log on ${input.contractAddress} has \`to\` = ${input.expectedToAddress}.`,
      };
    }

    // Step 6 — exact amount match (decimal.js / raw-integer comparison, no float).
    const observedAmountRaw = new Decimal(BigInt(match.data).toString(10));
    const observedAmount = observedAmountRaw.dividedBy(new Decimal(10).pow(input.tokenDecimals)).toFixed();
    const amountOk = amountsMatchExactly(input.expectedAmount, input.tokenDecimals, observedAmountRaw.toFixed(0));
    if (!amountOk) {
      return {
        ok: false,
        reason: 'AMOUNT_MISMATCH',
        detail: `amount ${new Decimal(input.expectedAmount).toFixed()} expected, ${observedAmount} observed.`,
      };
    }

    // Step 7 — confirmation depth.
    const blockNumber = parseInt(receipt.blockNumber, 16);
    const currentBlock = await fetchBlockNumber();
    const confirmations = computeConfirmations(currentBlock, blockNumber);
    if (confirmations < minConfirmations) {
      return {
        ok: false,
        reason: 'INSUFFICIENT_CONFIRMATIONS',
        detail: `Matches (contract/recipient/amount) but only ${confirmations}/${minConfirmations} confirmations.`,
        confirmations,
      };
    }

    // Step 8 — pass.
    return { ok: true, confirmations, blockNumber, observedAmount };
  } catch (e) {
    // Any network/RPC failure (including the TODO stubs above throwing) collapses to
    // RPC_UNAVAILABLE — a fault, never a false verdict (A-5 §2.4 closing paragraph).
    const err = e as Error;
    return { ok: false, reason: 'RPC_UNAVAILABLE', detail: err.message || 'On-chain lookup failed.' };
  }
}
