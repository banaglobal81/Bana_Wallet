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
  BALANCE_OF_SELECTOR,
  encodeBalanceOfCalldata,
  decodeHexQuantityToRawUnits,
  decodeHexQuantityToNumber,
  fromRawUnits,
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

describe('encodeBalanceOfCalldata', () => {
  it('prefixes the balanceOf selector and left-pads the address to a 32-byte word', () => {
    const addr = `0x${'ab'.repeat(20)}`;
    const calldata = encodeBalanceOfCalldata(addr);
    expect(calldata.startsWith(BALANCE_OF_SELECTOR)).toBe(true);
    expect(calldata).toBe(`${BALANCE_OF_SELECTOR}${'0'.repeat(24)}${'ab'.repeat(20)}`);
    expect(calldata.length).toBe(2 + 8 + 64); // '0x' + 4-byte selector + 32-byte word
  });

  it('lower-cases a mixed-case address (checksum input)', () => {
    const addr = `0x${'AB'.repeat(20)}`;
    expect(encodeBalanceOfCalldata(addr)).toBe(`${BALANCE_OF_SELECTOR}${'0'.repeat(24)}${'ab'.repeat(20)}`);
  });
});

describe('decodeHexQuantityToRawUnits', () => {
  it('decodes a hex quantity into a decimal integer string', () => {
    expect(decodeHexQuantityToRawUnits('0x0')).toBe('0');
    expect(decodeHexQuantityToRawUnits('0x1')).toBe('1');
    expect(decodeHexQuantityToRawUnits('0xde0b6b3a7640000')).toBe('1000000000000000000');
  });

  it('treats null/undefined/"0x" as zero, never throwing', () => {
    expect(decodeHexQuantityToRawUnits(null)).toBe('0');
    expect(decodeHexQuantityToRawUnits(undefined)).toBe('0');
    expect(decodeHexQuantityToRawUnits('0x')).toBe('0');
  });

  it('never loses precision on values past Number.MAX_SAFE_INTEGER (BigInt, not float)', () => {
    // 2^90 in hex — far past what a JS double can represent exactly.
    const big = (2n ** 90n).toString(16);
    expect(decodeHexQuantityToRawUnits(`0x${big}`)).toBe((2n ** 90n).toString(10));
  });
});

describe('decodeHexQuantityToNumber — regression for the NaN-confirmation-bypass bug (wallet-security-expert finding)', () => {
  it('decodes a well-formed hex quantity into a number', () => {
    expect(decodeHexQuantityToNumber('0x0')).toBe(0);
    expect(decodeHexQuantityToNumber('0x1')).toBe(1);
    expect(decodeHexQuantityToNumber('0x64')).toBe(100);
  });

  it('THROWS (never returns NaN) on null — parseInt(null, 16) silently returns NaN', () => {
    expect(() => decodeHexQuantityToNumber(null)).toThrow();
  });

  it('THROWS (never returns NaN) on undefined', () => {
    expect(() => decodeHexQuantityToNumber(undefined)).toThrow();
  });

  it('THROWS (never returns NaN) on a malformed hex string — parseInt would lenient-parse a prefix and stop, or return NaN', () => {
    expect(() => decodeHexQuantityToNumber('0xzz')).toThrow();
    expect(() => decodeHexQuantityToNumber('not-hex')).toThrow();
    expect(() => decodeHexQuantityToNumber('')).toThrow();
  });

  it('THROWS on a non-string type (e.g. a number or object slipping through a malformed RPC response)', () => {
    expect(() => decodeHexQuantityToNumber(123)).toThrow();
    expect(() => decodeHexQuantityToNumber({})).toThrow();
  });

  it('requires the 0x prefix — a bare hex digit string is rejected, not silently accepted', () => {
    expect(() => decodeHexQuantityToNumber('64')).toThrow();
  });

  it('THROWS on a value exceeding Number.MAX_SAFE_INTEGER rather than silently losing precision', () => {
    const tooLarge = (BigInt(Number.MAX_SAFE_INTEGER) + 1n).toString(16);
    expect(() => decodeHexQuantityToNumber(`0x${tooLarge}`)).toThrow();
  });

  it('never produces a NaN that would defeat the `confirmations < minConfirmations` check', () => {
    // Direct demonstration of the bug this guards against: parseInt(null, 16) is NaN,
    // and `NaN < 3` is false in JS — so the old code let an unconfirmed/garbage
    // response pass the confirmation-depth gate. decodeHexQuantityToNumber must throw
    // instead of ever reaching that comparison with a NaN operand.
    expect(Number.isNaN(parseInt(null, 16))).toBe(true); // documents the old bug's root cause
    expect(() => decodeHexQuantityToNumber(null)).toThrow(); // the fix: throw, don't compare
  });
});

describe('fromRawUnits', () => {
  it('is the inverse of toRawUnits', () => {
    expect(fromRawUnits('1000000000000000000', 18)).toBe('1');
    expect(fromRawUnits('1000000000000', 18)).toBe('0.000001');
    expect(fromRawUnits('0', 18)).toBe('0');
  });

  it('never uses float for large raw values (precision-safe)', () => {
    expect(fromRawUnits('123456789123456789000000000', 18)).toBe('123456789.123456789');
  });
});
