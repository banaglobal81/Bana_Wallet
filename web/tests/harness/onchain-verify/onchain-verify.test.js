// tests/harness/onchain-verify/onchain-verify.test.js
// Deterministic verification of server/core/onchain-verify.js (A-5 §2).
// Run: npx vitest run tests/harness/onchain-verify
import { describe, it, expect } from 'vitest';
import {
  TRANSFER_EVENT_TOPIC,
  MIN_WITHDRAWAL_ONCHAIN_CONFIRMATIONS_FLOOR,
  clampMinConfirmations,
  computeConfirmations,
  filterTransferLogs,
  decodeTransferTo,
  decodeTransferValueRaw,
  findRecipientMatch,
  toRawUnits,
  amountsMatchExactly,
} from '../../../server/core/onchain-verify.js';

// All fixture addresses are exactly 40 hex chars (20 bytes) — built via repeat()
// rather than hand-typed literals to avoid off-by-one padding bugs.
const CONTRACT = `0x${'a'.repeat(36)}0001`;
const OTHER_CONTRACT = `0x${'d'.repeat(36)}beef`;
const TO_ADDR = `0x${'1'.repeat(36)}aaaa`;
const OTHER_ADDR = `0x${'2'.repeat(36)}bbbb`;

function padTopic(addr) {
  return `0x${'0'.repeat(24)}${addr.slice(2).toLowerCase()}`;
}

function transferLog({ address = CONTRACT, to = TO_ADDR, value = 1000000000000000000n }) {
  return {
    address,
    topics: [TRANSFER_EVENT_TOPIC, padTopic('0x' + '0'.repeat(40)), padTopic(to)],
    data: `0x${value.toString(16)}`,
  };
}

describe('MIN_WITHDRAWAL_ONCHAIN_CONFIRMATIONS_FLOOR / clampMinConfirmations', () => {
  it('the floor constant is 3 (A-5 §2.6)', () => {
    expect(MIN_WITHDRAWAL_ONCHAIN_CONFIRMATIONS_FLOOR).toBe(3);
  });

  it('clamps a configured value below the floor and flags it', () => {
    expect(clampMinConfirmations(1)).toEqual({ value: 3, clamped: true });
    expect(clampMinConfirmations(0)).toEqual({ value: 3, clamped: true });
  });

  it('passes through a value exactly at the floor, unclamped', () => {
    expect(clampMinConfirmations(3)).toEqual({ value: 3, clamped: false });
  });

  it('passes through a value above the floor, unclamped', () => {
    expect(clampMinConfirmations(15)).toEqual({ value: 15, clamped: false });
  });
});

describe('computeConfirmations', () => {
  it('is currentBlock - txBlockNumber + 1 (A-5 §2.4 step 7)', () => {
    expect(computeConfirmations(100, 100)).toBe(1);
    expect(computeConfirmations(115, 100)).toBe(16);
  });
});

describe('filterTransferLogs', () => {
  it('returns candidates matching both topic0 and contract address', () => {
    const logs = [transferLog({}), { address: OTHER_CONTRACT, topics: ['0xnotTransfer'], data: '0x1' }];
    const { candidates, contractMismatch } = filterTransferLogs(logs, CONTRACT);
    expect(candidates).toHaveLength(1);
    expect(contractMismatch).toBe(false);
  });

  it('flags contractMismatch when Transfer logs exist only on a different contract (WRONG_CONTRACT vs NO_TRANSFER_EVENT)', () => {
    const logs = [transferLog({ address: OTHER_CONTRACT })];
    const { candidates, contractMismatch } = filterTransferLogs(logs, CONTRACT);
    expect(candidates).toHaveLength(0);
    expect(contractMismatch).toBe(true);
  });

  it('reports no contractMismatch when there are no Transfer logs at all (NO_TRANSFER_EVENT)', () => {
    const logs = [{ address: CONTRACT, topics: ['0xsomethingElse'], data: '0x1' }];
    const { candidates, contractMismatch } = filterTransferLogs(logs, CONTRACT);
    expect(candidates).toHaveLength(0);
    expect(contractMismatch).toBe(false);
  });
});

describe('decodeTransferTo / decodeTransferValueRaw', () => {
  it('decodes the recipient address from topics[2]', () => {
    const log = transferLog({ to: TO_ADDR });
    expect(decodeTransferTo(log)).toBe(TO_ADDR.toLowerCase());
  });

  it('decodes the raw uint256 value from data', () => {
    const log = transferLog({ value: 123456789n });
    expect(decodeTransferValueRaw(log)).toBe('123456789');
  });
});

describe('findRecipientMatch', () => {
  it('finds the single candidate whose `to` matches expectedToAddress', () => {
    const candidates = [transferLog({ to: OTHER_ADDR }), transferLog({ to: TO_ADDR })];
    const match = findRecipientMatch(candidates, TO_ADDR);
    expect(match).not.toBeNull();
    expect(decodeTransferTo(match)).toBe(TO_ADDR.toLowerCase());
  });

  it('returns null when no candidate matches (WRONG_RECIPIENT)', () => {
    const candidates = [transferLog({ to: OTHER_ADDR })];
    expect(findRecipientMatch(candidates, TO_ADDR)).toBeNull();
  });

  it('does NOT sum multiple candidates — a single log must match exactly (A-5 §2.4 step 6)', () => {
    // Two logs to the same recipient, neither individually equal to the expected total.
    const candidates = [
      transferLog({ to: TO_ADDR, value: 500000000000000000n }),
      transferLog({ to: TO_ADDR, value: 500000000000000000n }),
    ];
    // findRecipientMatch just returns the first structural match — amount equality is
    // checked separately by amountsMatchExactly on that single log, so a "sum to 1.0"
    // aggregation never happens implicitly here.
    const match = findRecipientMatch(candidates, TO_ADDR);
    expect(decodeTransferValueRaw(match)).toBe('500000000000000000');
  });
});

describe('toRawUnits / amountsMatchExactly', () => {
  it('converts a decimal amount string to raw integer units using tokenDecimals', () => {
    expect(toRawUnits('1', 18)).toBe('1000000000000000000');
    expect(toRawUnits('0.000001', 18)).toBe('1000000000000');
    expect(toRawUnits('100', 6)).toBe('100000000');
  });

  it('matches exactly when raw units are equal', () => {
    expect(amountsMatchExactly('1', 18, '1000000000000000000')).toBe(true);
  });

  it('rejects a near-miss amount — no float/epsilon tolerance', () => {
    expect(amountsMatchExactly('1', 18, '999999999999999999')).toBe(false);
    expect(amountsMatchExactly('1', 18, '1000000000000000001')).toBe(false);
  });

  it('never uses float comparison for large values (precision-safe)', () => {
    // A value well past Number.MAX_SAFE_INTEGER when expressed in raw 18-decimal units.
    expect(amountsMatchExactly('123456789.123456789', 18, '123456789123456789000000000')).toBe(true);
  });
});
