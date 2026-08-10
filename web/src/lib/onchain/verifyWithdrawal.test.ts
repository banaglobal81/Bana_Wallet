// web/src/lib/onchain/verifyWithdrawal.test.ts
// Regression coverage for the wallet-security-expert finding: a malformed/NaN
// eth_blockNumber (or receipt.blockNumber) result must never silently bypass the
// confirmation-depth check (`confirmations < minConfirmations` is always `false`
// when either operand is NaN in JS). verifyOnchainWithdrawal must collapse any such
// malformed RPC response to RPC_UNAVAILABLE, never a false `ok: true`.
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./rpc', () => ({
  jsonRpcCallWithSource: vi.fn(),
}));

import { jsonRpcCallWithSource } from './rpc';
import { verifyOnchainWithdrawal, isOnchainVerifyFailure } from './verifyWithdrawal';

const CONTRACT = `0x${'a'.repeat(40)}`;
const TO_ADDR = `0x${'1'.repeat(40)}`;

function padTopic(addr: string) {
  return `0x${'0'.repeat(24)}${addr.slice(2).toLowerCase()}`;
}

const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function transferLog({ to = TO_ADDR, value = 1000000000000000000n } = {}) {
  return {
    address: CONTRACT,
    topics: [TRANSFER_EVENT_TOPIC, padTopic(`0x${'0'.repeat(40)}`), padTopic(to)],
    data: `0x${value.toString(16)}`,
  };
}

function goodReceipt(blockNumberHex = '0x64') {
  return {
    status: '0x1',
    blockNumber: blockNumberHex,
    logs: [transferLog({})],
  };
}

const baseInput = {
  chainId: 56,
  contractAddress: CONTRACT,
  expectedToAddress: TO_ADDR,
  expectedAmount: '1',
  tokenDecimals: 18,
  txHash: '0xabc',
  minConfirmations: 3,
};

describe('verifyOnchainWithdrawal — NaN block-number regression', () => {
  beforeEach(() => {
    vi.mocked(jsonRpcCallWithSource).mockReset();
  });

  it('collapses a malformed eth_blockNumber result (null) to RPC_UNAVAILABLE, never a false pass', async () => {
    vi.mocked(jsonRpcCallWithSource).mockImplementation(async (method: string) => {
      if (method === 'eth_getTransactionReceipt') {
        return { result: goodReceipt('0x64'), source: 'configured#1' };
      }
      if (method === 'eth_blockNumber') {
        // The bug this guards: a malformed/null result. The old parseInt(null, 16)
        // silently became NaN and sailed through `NaN < minConfirmations` as `false`.
        return { result: null, source: 'configured#1' };
      }
      throw new Error(`unexpected method ${method}`);
    });

    const outcome = await verifyOnchainWithdrawal(baseInput);
    expect(isOnchainVerifyFailure(outcome)).toBe(true);
    if (isOnchainVerifyFailure(outcome)) {
      expect(outcome.reason).toBe('RPC_UNAVAILABLE');
    }
  });

  it('collapses a malformed receipt.blockNumber (garbage hex) to RPC_UNAVAILABLE', async () => {
    vi.mocked(jsonRpcCallWithSource).mockImplementation(async (method: string) => {
      if (method === 'eth_getTransactionReceipt') {
        return { result: goodReceipt('0xnotHex'), source: 'configured#1' };
      }
      if (method === 'eth_blockNumber') {
        return { result: '0x64', source: 'configured#1' };
      }
      throw new Error(`unexpected method ${method}`);
    });

    const outcome = await verifyOnchainWithdrawal(baseInput);
    expect(isOnchainVerifyFailure(outcome)).toBe(true);
    if (isOnchainVerifyFailure(outcome)) {
      expect(outcome.reason).toBe('RPC_UNAVAILABLE');
    }
  });

  it('passes when the block number is well-formed and confirmations are sufficient', async () => {
    vi.mocked(jsonRpcCallWithSource).mockImplementation(async (method: string) => {
      if (method === 'eth_getTransactionReceipt') {
        return { result: goodReceipt('0x64'), source: 'configured#1' };
      }
      if (method === 'eth_blockNumber') {
        return { result: '0x67', source: 'configured#1' }; // 0x67 - 0x64 + 1 = 4 confirmations
      }
      throw new Error(`unexpected method ${method}`);
    });

    const outcome = await verifyOnchainWithdrawal(baseInput);
    expect(isOnchainVerifyFailure(outcome)).toBe(false);
    if (!isOnchainVerifyFailure(outcome)) {
      expect(outcome.confirmations).toBe(4);
      expect(outcome.usedPublicFallbackRpc).toBe(false);
    }
  });

  it('flags usedPublicFallbackRpc when any underlying call was answered by a public#N source', async () => {
    vi.mocked(jsonRpcCallWithSource).mockImplementation(async (method: string) => {
      if (method === 'eth_getTransactionReceipt') {
        return { result: goodReceipt('0x64'), source: 'configured#1' };
      }
      if (method === 'eth_blockNumber') {
        return { result: '0x67', source: 'public#1' };
      }
      throw new Error(`unexpected method ${method}`);
    });

    const outcome = await verifyOnchainWithdrawal(baseInput);
    expect(isOnchainVerifyFailure(outcome)).toBe(false);
    if (!isOnchainVerifyFailure(outcome)) {
      expect(outcome.usedPublicFallbackRpc).toBe(true);
      expect(outcome.rpcSources).toContain('public#1');
    }
  });
});
