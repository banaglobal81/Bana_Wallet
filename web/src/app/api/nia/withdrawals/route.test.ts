// W-1 regression coverage: the available-balance check
// (niaBal - locked >= requested amount) must run UNCONDITIONALLY on POST
// /api/nia/withdrawals, not only when the user has staking-locked principal.
// Before this fix, a user with zero staking lock (the common case) could
// submit a withdrawal request for any amount — including far more than their
// hub balance — with no balance verification at all, and it would still be
// queued as a PENDING WithdrawalRequest awaiting admin approval.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const authMock = vi.fn();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

const resolveSessionUserIdMock = vi.fn();
vi.mock('@/lib/nia/resolve', () => ({ resolveSessionUserId: () => resolveSessionUserIdMock() }));

const niaWalletRequestMock = vi.fn();
vi.mock('@/lib/nia/client', () => ({ niaWalletRequest: (...args: unknown[]) => niaWalletRequestMock(...args) }));

const getPlatformSettingsMock = vi.fn();
vi.mock('@/lib/platformSettings', () => ({ getPlatformSettings: () => getPlatformSettingsMock() }));

const forwardWithdrawalToHubMock = vi.fn();
vi.mock('@/lib/withdrawals', () => ({ forwardWithdrawalToHub: (...args: unknown[]) => forwardWithdrawalToHubMock(...args) }));

// niaState pulls in `import 'server-only'` transitively — stub it with a plain
// in-memory Set so this test doesn't need the Next.js "react-server" export
// condition that plain Vitest doesn't set.
vi.mock('@/lib/nia/state', () => ({
  niaState: { inFlightWithdrawals: new Set<string>(), inFlightAddresses: new Set<string>(), webhookEvents: [], webhookEventSeq: 0 },
}));

const settleMaturedPositionsMock = vi.fn();
const lockedPrincipalByCoinMock = vi.fn();
vi.mock('@/lib/staking', () => ({
  settleMaturedPositions: (...args: unknown[]) => settleMaturedPositionsMock(...args),
  lockedPrincipalByCoin: (...args: unknown[]) => lockedPrincipalByCoinMock(...args),
}));

const userFindUniqueMock = vi.fn();
const withdrawalAddressFindFirstMock = vi.fn();
const withdrawalRequestFindManyMock = vi.fn();
const withdrawalRequestCreateMock = vi.fn();
const withdrawalRequestUpdateManyMock = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUniqueMock(...args) },
    withdrawalAddress: { findFirst: (...args: unknown[]) => withdrawalAddressFindFirstMock(...args) },
    withdrawalRequest: {
      findMany: (...args: unknown[]) => withdrawalRequestFindManyMock(...args),
      create: (...args: unknown[]) => withdrawalRequestCreateMock(...args),
      updateMany: (...args: unknown[]) => withdrawalRequestUpdateManyMock(...args),
    },
  },
}));

import { POST } from './route';

function makeRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return {
    json: async () => body,
    headers: { get: (name: string) => headers[name] ?? null },
  } as unknown as NextRequest;
}

const BASE_BODY = { currency: 'USDT', network: 'TRC20', toAddress: 'T-some-address', amount: '100' };

describe('POST /api/nia/withdrawals — W-1 available-balance check', () => {
  afterEach(() => { vi.clearAllMocks(); });

  function setupHappyDefaults() {
    resolveSessionUserIdMock.mockResolvedValue('nia-user-1');
    authMock.mockResolvedValue({ user: { id: 'db-user-1', email: 'user@test.com' } });
    userFindUniqueMock.mockResolvedValue(null); // no recent email change
    getPlatformSettingsMock.mockResolvedValue(null); // no policy restrictions
    settleMaturedPositionsMock.mockResolvedValue(undefined);
    withdrawalRequestCreateMock.mockResolvedValue({
      id: 'wr-1', userId: 'db-user-1', niaUserId: 'nia-user-1', email: 'user@test.com',
      currency: 'USDT', network: 'TRC20', amount: '100', toAddress: 'T-some-address', status: 'PENDING',
    });
  }

  it('rejects a withdrawal exceeding the hub balance even when locked == 0 (the W-1 gap)', async () => {
    setupHappyDefaults();
    lockedPrincipalByCoinMock.mockResolvedValue(new Map()); // no staking lock at all
    niaWalletRequestMock.mockResolvedValue([{ currency: 'USDT', balance: '10' }]); // only 10 available

    const res = await POST(makeRequest({ ...BASE_BODY, amount: '100' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/insufficient balance/i);
    expect(withdrawalRequestCreateMock).not.toHaveBeenCalled();
  });

  it('allows a withdrawal within the hub balance when locked == 0', async () => {
    setupHappyDefaults();
    lockedPrincipalByCoinMock.mockResolvedValue(new Map());
    niaWalletRequestMock.mockResolvedValue([{ currency: 'USDT', balance: '500' }]);

    const res = await POST(makeRequest({ ...BASE_BODY, amount: '100' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(withdrawalRequestCreateMock).toHaveBeenCalledTimes(1);
  });

  it('still rejects with the staking-lock message when locked > 0 is the binding constraint', async () => {
    setupHappyDefaults();
    lockedPrincipalByCoinMock.mockResolvedValue(new Map([['USDT', new (await import('decimal.js')).default('950')]]));
    niaWalletRequestMock.mockResolvedValue([{ currency: 'USDT', balance: '1000' }]); // available = 1000 - 950 = 50

    const res = await POST(makeRequest({ ...BASE_BODY, amount: '100' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/locked in staking/i);
    expect(withdrawalRequestCreateMock).not.toHaveBeenCalled();
  });

  it('fails closed (503) if the hub balance cannot be verified, even when locked == 0', async () => {
    setupHappyDefaults();
    lockedPrincipalByCoinMock.mockResolvedValue(new Map());
    niaWalletRequestMock.mockRejectedValue(new Error('hub unreachable'));

    const res = await POST(makeRequest({ ...BASE_BODY, amount: '100' }));
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.ok).toBe(false);
    expect(withdrawalRequestCreateMock).not.toHaveBeenCalled();
  });
});
