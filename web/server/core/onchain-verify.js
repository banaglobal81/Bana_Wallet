// server/core/onchain-verify.js — pure logic (harness target)
//
// Design doc: docs/specs/staking-yield-system-v2-design-a5-withdrawal-queue.md §2
// (A-5 — on-chain read-only withdrawal verification helper).
//
// Pure functions only: ERC20/BEP20 Transfer-log filtering/decoding, amount/address
// comparison, confirmation-depth math, and the withdrawalOnchainMinConfirmations
// floor clamp. No fetch/RPC here — those live in src/lib/onchain/verifyWithdrawal.ts
// (same split as nia-signing.js / client.ts — see docs/architecture/harness.md).
// Deterministic + no I/O => harness-testable (web/tests/harness/onchain-verify/).
//
// SECURITY (A-5 §2.1/§2.8, §4): this file — and everything under src/lib/onchain/ —
// must NEVER contain signing/private-key/mnemonic code. Read-only verification only.
// Every change to this file tree requires a wallet-security-expert review (A-5 §2.2).

import Decimal from 'decimal.js';

/**
 * keccak256("Transfer(address,address,uint256)") — the well-known ERC20/BEP20
 * Transfer event topic0. A fixed constant, never computed at runtime (A-5 §2.4 step 3).
 */
export const TRANSFER_EVENT_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/**
 * A-5 §2.6 — "the absolute floor below which reorg protection is effectively gone".
 * NOT the operational value (PlatformSetting.withdrawalOnchainMinConfirmations,
 * default 15, a research-pending conservative placeholder) — this is the app-level
 * lower bound that value is clamped against, because Prisma has no DB-level CHECK
 * constraint to enforce it directly.
 */
export const MIN_WITHDRAWAL_ONCHAIN_CONFIRMATIONS_FLOOR = 3;

/**
 * Clamp a configured minConfirmations value against the floor (A-5 §2.6 "strike
 * point 2" — read-time, fail-closed; defends against a wrong/tampered
 * PlatformSetting value even if write-time validation elsewhere is bypassed).
 * @param {number} rawMinConfirmations
 * @returns {{ value: number, clamped: boolean }} clamped === true means
 *   rawMinConfirmations < FLOOR and the floor was applied — callers must
 *   recordAudit('WITHDRAWAL_ONCHAIN_MIN_CONFIRMATIONS_FLOOR_APPLIED') when this is true.
 */
export function clampMinConfirmations(rawMinConfirmations) {
  const value = Math.max(rawMinConfirmations, MIN_WITHDRAWAL_ONCHAIN_CONFIRMATIONS_FLOOR);
  return { value, clamped: value !== rawMinConfirmations };
}

/**
 * confirmations = currentBlock - txBlockNumber + 1 (A-5 §2.4 step 7).
 * @param {number} currentBlock
 * @param {number} txBlockNumber
 * @returns {number}
 */
export function computeConfirmations(currentBlock, txBlockNumber) {
  return currentBlock - txBlockNumber + 1;
}

/**
 * Split a transaction receipt's logs into Transfer-event candidates on the expected
 * contract (A-5 §2.4 steps 3-4). `contractMismatch` distinguishes "no Transfer event
 * at all" (NO_TRANSFER_EVENT) from "Transfer events exist, but none on this contract"
 * (WRONG_CONTRACT) — collapsing the two would hide a same-symbol fake-token attack (DP-3).
 * @param {Array<{ address: string, topics: string[], data: string }>} logs
 * @param {string} contractAddress
 * @returns {{ candidates: Array<{address:string,topics:string[],data:string}>, contractMismatch: boolean }}
 */
export function filterTransferLogs(logs, contractAddress) {
  const transferLogs = (logs ?? []).filter(
    (log) => log?.topics?.[0]?.toLowerCase() === TRANSFER_EVENT_TOPIC.toLowerCase(),
  );
  const candidates = transferLogs.filter(
    (log) => log?.address?.toLowerCase() === contractAddress.toLowerCase(),
  );
  return {
    candidates,
    contractMismatch: transferLogs.length > 0 && candidates.length === 0,
  };
}

/**
 * Decode the `to` address from a Transfer log's topics[2] (lower 20 bytes of the
 * 32-byte padded topic).
 * @param {{ topics: string[] }} log
 * @returns {string} lowercase 0x-prefixed address
 */
export function decodeTransferTo(log) {
  const topic = log.topics[2];
  return `0x${topic.slice(-40)}`.toLowerCase();
}

/**
 * Decode the raw uint256 transfer value from a Transfer log's `data` field.
 * @param {{ data: string }} log
 * @returns {string} decimal integer string, raw token units (no float)
 */
export function decodeTransferValueRaw(log) {
  return BigInt(log.data).toString(10);
}

/**
 * Among Transfer-log candidates already filtered to the expected contract, find the
 * single log whose `to` matches expectedToAddress (A-5 §2.4 step 5). Deliberately
 * returns at most one log and never sums multiple matches — "a single log must match
 * exactly" (A-5 §2.4 step 6 note): summing would let unrelated transfers in the same
 * tx be stitched into a match.
 * @param {Array<{ topics: string[], data: string }>} candidates
 * @param {string} expectedToAddress
 * @returns {{topics:string[],data:string}|null}
 */
export function findRecipientMatch(candidates, expectedToAddress) {
  const wanted = expectedToAddress.toLowerCase();
  return candidates.find((log) => decodeTransferTo(log) === wanted) ?? null;
}

/**
 * decimal amount string -> raw integer unit string, using the token's on-chain
 * decimals (A-5 §2.4 step 6, CLAUDE.md rule 2 — decimal.js only, never Number()).
 * @param {string} amountDecimalStr
 * @param {number} tokenDecimals
 * @returns {string}
 */
export function toRawUnits(amountDecimalStr, tokenDecimals) {
  return new Decimal(amountDecimalStr).times(new Decimal(10).pow(tokenDecimals)).toFixed(0);
}

/**
 * Exact integer-string comparison between the expected amount (decimal string, human
 * units) and the observed raw on-chain value (integer string, raw units) — A-5 §2.4
 * step 6. No float, no epsilon/"close enough" tolerance ("almost right" never passes).
 * @param {string} expectedAmountDecimalStr
 * @param {number} tokenDecimals
 * @param {string} observedRawValueStr
 * @returns {boolean}
 */
export function amountsMatchExactly(expectedAmountDecimalStr, tokenDecimals, observedRawValueStr) {
  return toRawUnits(expectedAmountDecimalStr, tokenDecimals) === observedRawValueStr;
}

// ---------------------------------------------------------------------------
// PoR-1″ right-hand side + on-chain withdrawal verify — real-RPC follow-up task
// (A-3 §4.5 "fetchOnchainBalance TODO" / A-5 §2.8 "fetchTransactionReceipt et al
// TODO"). Pure calldata-encoding/response-decoding helpers only — no fetch here.
// The actual JSON-RPC POST lives in src/lib/onchain/rpc.ts (same split as the rest
// of this file, see docs/architecture/harness.md).
// ---------------------------------------------------------------------------

/**
 * ERC20/BEP20 `balanceOf(address)` function selector — first 4 bytes of
 * keccak256("balanceOf(address)"). A fixed constant, never computed at runtime
 * (same convention as TRANSFER_EVENT_TOPIC above).
 */
export const BALANCE_OF_SELECTOR = '0x70a08231';

/**
 * Build the `data` field for an `eth_call` to `balanceOf(address)` — the 4-byte
 * selector followed by the address, left-padded to a 32-byte word.
 * @param {string} address 0x-prefixed 20-byte address
 * @returns {string}
 */
export function encodeBalanceOfCalldata(address) {
  const stripped = address.toLowerCase().replace(/^0x/, '');
  return `${BALANCE_OF_SELECTOR}${stripped.padStart(64, '0')}`;
}

/**
 * Decode an `eth_call`/hex-quantity RPC result (e.g. balanceOf's return value, or
 * eth_blockNumber) into a raw-integer decimal string — BigInt only, never
 * Number()/parseFloat (CLAUDE.md rule 2). `null`/`undefined`/`'0x'` decode to `'0'`
 * (a token contract legitimately returns `0x` for a zero balance on some clients).
 * @param {string|null|undefined} hex
 * @returns {string}
 */
export function decodeHexQuantityToRawUnits(hex) {
  if (!hex || hex === '0x') return '0';
  return BigInt(hex).toString(10);
}

/**
 * Strictly parse a JSON-RPC "hex quantity" result (e.g. eth_blockNumber's return
 * value, or a receipt's `blockNumber` field) into a `number`. Throws on anything
 * that is not a well-formed `0x`-prefixed hex string.
 *
 * SECURITY (wallet-security-expert review, A-5): this exists specifically because
 * `parseInt(x, 16)` is a lenient partial parser — `parseInt(null, 16)`,
 * `parseInt('0xzz', 16)`, `parseInt(undefined, 16)` etc. all return `NaN` *without
 * throwing*. Downstream, `verifyOnchainWithdrawal`'s confirmation-depth check is
 * `if (confirmations < minConfirmations)` — and in JS, `NaN < anything` is always
 * `false`, so a NaN confirmation count silently PASSES the depth check regardless of
 * whether the transaction is actually confirmed. Using BigInt() (after a regex
 * format check) instead of parseInt() closes that hole: any malformed/unexpected RPC
 * response throws here, which the caller's try/catch collapses to RPC_UNAVAILABLE —
 * never a false "verified" outcome (A-5 §2.4 closing paragraph).
 * @param {unknown} hex
 * @param {string} [label] optional context for the error message (e.g. 'eth_blockNumber')
 * @returns {number}
 */
export function decodeHexQuantityToNumber(hex, label = 'hex quantity') {
  if (typeof hex !== 'string' || !/^0x[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(`Malformed ${label}: expected a 0x-prefixed hex string, got ${JSON.stringify(hex)}.`);
  }
  const big = BigInt(hex);
  if (big > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Malformed ${label}: value ${hex} exceeds Number.MAX_SAFE_INTEGER.`);
  }
  return Number(big);
}

/**
 * Convert a raw on-chain integer-unit string (e.g. balanceOf's raw return value)
 * into a human decimal-string amount using the token's decimals (decimal.js only,
 * CLAUDE.md rule 2 — mirrors toRawUnits' inverse direction).
 * @param {string} rawUnitsStr
 * @param {number} tokenDecimals
 * @returns {string}
 */
export function fromRawUnits(rawUnitsStr, tokenDecimals) {
  return new Decimal(rawUnitsStr).dividedBy(new Decimal(10).pow(tokenDecimals)).toFixed();
}
