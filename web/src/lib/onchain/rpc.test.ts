// web/src/lib/onchain/rpc.test.ts
// Regression coverage for the wallet-security-expert URL-leak finding on
// web/src/lib/onchain/rpc.ts: error messages (and the `source` label returned by
// jsonRpcCallWithSource) must never contain the raw RPC endpoint URL — operator-
// configured endpoints (BSC_RPC_URL) commonly embed an API key in the URL itself,
// and these errors flow into WithdrawalOnchainVerificationAttempt.detail (persisted)
// and the submit-tx admin API response (rendered in the browser).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET_URL = 'https://bsc-mainnet.g.alchemy.com/v2/super-secret-api-key-12345';

async function freshRpcModule() {
  vi.resetModules();
  return import('./rpc');
}

describe('rpc.ts — jsonRpcCallWithSource / callOne URL redaction', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.BSC_RPC_URL;
    delete process.env.BSC_RPC_URL_FALLBACK;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.BSC_RPC_URL;
    delete process.env.BSC_RPC_URL_FALLBACK;
    vi.restoreAllMocks();
  });

  it('never includes the configured RPC URL (which may embed an API key) in a thrown error message', async () => {
    process.env.BSC_RPC_URL = SECRET_URL;
    const { jsonRpcCallWithSource } = await freshRpcModule();

    global.fetch = vi.fn(async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;

    try {
      await jsonRpcCallWithSource('eth_blockNumber', []);
      throw new Error('expected jsonRpcCallWithSource to throw');
    } catch (e) {
      const message = (e as Error).message;
      expect(message).not.toContain(SECRET_URL);
      expect(message).not.toContain('super-secret-api-key-12345');
      // The anonymous label must still be present, so the error is still diagnosable.
      expect(message).toContain('configured#1');
    }
  });

  it('never includes the URL in a JSON-RPC `error` field failure either', async () => {
    process.env.BSC_RPC_URL = SECRET_URL;
    const { jsonRpcCallWithSource } = await freshRpcModule();

    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'boom' } }),
    })) as unknown as typeof fetch;

    try {
      await jsonRpcCallWithSource('eth_blockNumber', []);
      throw new Error('expected jsonRpcCallWithSource to throw');
    } catch (e) {
      const message = (e as Error).message;
      expect(message).not.toContain(SECRET_URL);
      expect(message).not.toContain('super-secret-api-key-12345');
    }
  });

  it('labels a successful configured endpoint as "configured#1", never the URL', async () => {
    process.env.BSC_RPC_URL = SECRET_URL;
    const { jsonRpcCallWithSource } = await freshRpcModule();

    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', id: 1, result: '0x64' }),
    })) as unknown as typeof fetch;

    const { result, source } = await jsonRpcCallWithSource('eth_blockNumber', []);
    expect(result).toBe('0x64');
    expect(source).toBe('configured#1');
  });

  it('falls back through to a public endpoint and labels it "public#N" when the configured endpoint fails', async () => {
    process.env.BSC_RPC_URL = SECRET_URL;
    const { jsonRpcCallWithSource } = await freshRpcModule();

    let call = 0;
    global.fetch = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        // The configured endpoint fails.
        return { ok: false, status: 503 };
      }
      // First public fallback succeeds.
      return { ok: true, json: async () => ({ jsonrpc: '2.0', id: call, result: '0x1' }) };
    }) as unknown as typeof fetch;

    const { result, source } = await jsonRpcCallWithSource('eth_blockNumber', []);
    expect(result).toBe('0x1');
    expect(source).toBe('public#1');
  });

  it('jsonRpcCall() (no-source convenience wrapper) still never leaks the URL on failure', async () => {
    process.env.BSC_RPC_URL = SECRET_URL;
    const { jsonRpcCall } = await freshRpcModule();

    global.fetch = vi.fn(async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;

    try {
      await jsonRpcCall('eth_blockNumber', []);
      throw new Error('expected jsonRpcCall to throw');
    } catch (e) {
      expect((e as Error).message).not.toContain(SECRET_URL);
    }
  });
});
