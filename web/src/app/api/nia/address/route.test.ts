// V2-CORE HIGH-severity fix (wallet-security-expert review): POST /api/nia/address
// previously created hub deposit addresses without ever consulting
// assertDepositAddressAllowed() (A-2 §4.4, X-7) — a LOCAL-authority coin (e.g. BANA)
// could still be issued an irreversible hub deposit address. This suite locks in the
// gate: it must run after currency/network format validation and before any Nia-Hub
// call, and a CoinAuthorityBlockedError must map to 403.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const resolveSessionUserIdMock = vi.fn();
vi.mock('@/lib/nia/resolve', () => ({ resolveSessionUserId: () => resolveSessionUserIdMock() }));

const niaBearerRequestMock = vi.fn();
vi.mock('@/lib/nia/client', () => ({ niaBearerRequest: (...args: unknown[]) => niaBearerRequestMock(...args) }));

// niaState pulls in `import 'server-only'` transitively — stub it with a plain
// in-memory Set so this test doesn't need the Next.js "react-server" export
// condition that plain Vitest doesn't set.
vi.mock('@/lib/nia/state', () => ({
  niaState: { inFlightWithdrawals: new Set<string>(), inFlightAddresses: new Set<string>(), webhookEvents: [], webhookEventSeq: 0 },
}));

const assertDepositAddressAllowedMock = vi.fn();
// vi.mock factories are hoisted above the rest of the module, so the class
// referenced inside must be created via vi.hoisted (a plain `class` decl
// referenced from the factory below would otherwise throw a TDZ error).
const { FakeCoinAuthorityBlockedError } = vi.hoisted(() => {
  class FakeCoinAuthorityBlockedError extends Error {
    reason: string;
    symbol: string;
    constructor(reason: string, symbol: string, message: string) {
      super(message);
      this.reason = reason;
      this.symbol = symbol;
      this.name = 'CoinAuthorityBlockedError';
    }
  }
  return { FakeCoinAuthorityBlockedError };
});
vi.mock('@/lib/coinAuthority', () => ({
  assertDepositAddressAllowed: (...args: unknown[]) => assertDepositAddressAllowedMock(...args),
  CoinAuthorityBlockedError: FakeCoinAuthorityBlockedError,
}));

import { POST } from './route';

function makeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

describe('POST /api/nia/address — coin-authority gate (A-2 §4.4)', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('blocks (403) a LOCAL-authority coin without ever calling the hub', async () => {
    resolveSessionUserIdMock.mockResolvedValue('nia-user-1');
    assertDepositAddressAllowedMock.mockRejectedValue(
      new FakeCoinAuthorityBlockedError('DEPOSIT_ADDRESS_BLOCKED', 'BANA', 'BANA: LOCAL-authority coins have no hub deposit rail.'),
    );

    const res = await POST(makeRequest({ currency: 'BANA', network: 'BSC' }));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/LOCAL-authority/);
    expect(niaBearerRequestMock).not.toHaveBeenCalled();
  });

  it('allows a HUB-authority coin through to the hub call', async () => {
    resolveSessionUserIdMock.mockResolvedValue('nia-user-1');
    assertDepositAddressAllowedMock.mockResolvedValue(undefined);
    niaBearerRequestMock.mockResolvedValue({ address: '0xabc', memo: '' });

    const res = await POST(makeRequest({ currency: 'USDT', network: 'BSC' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data).toEqual({ address: '0xabc', memo: '' });
    expect(assertDepositAddressAllowedMock).toHaveBeenCalledWith('USDT');
    expect(niaBearerRequestMock).toHaveBeenCalledTimes(1);
  });

  it('checks authority before format-invalid currency ever reaches the gate (400, not 403)', async () => {
    resolveSessionUserIdMock.mockResolvedValue('nia-user-1');

    const res = await POST(makeRequest({ currency: '', network: 'BSC' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(assertDepositAddressAllowedMock).not.toHaveBeenCalled();
  });

  it('propagates a non-CoinAuthorityBlockedError as an unhandled failure (fail-closed, not swallowed as 403)', async () => {
    resolveSessionUserIdMock.mockResolvedValue('nia-user-1');
    assertDepositAddressAllowedMock.mockRejectedValue(new Error('unexpected db error'));

    await expect(POST(makeRequest({ currency: 'USDT', network: 'BSC' }))).rejects.toThrow('unexpected db error');
    expect(niaBearerRequestMock).not.toHaveBeenCalled();
  });
});
