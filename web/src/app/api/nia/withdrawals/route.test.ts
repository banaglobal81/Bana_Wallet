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

// A-5 (V2-CORE) LOCAL rail — coin-authority branch + hold creation + local
// balance read. Explicitly mocked (rather than relying on the "unmocked
// module throws -> caught -> falls back to HUB" behavior) so the HUB-rail
// tests above stay green for an explicit, readable reason, and the LOCAL-rail
// tests below can control every branch precisely.
const getCoinAuthorityMock = vi.fn();
const assertExecutionAllowedMock = vi.fn();
// vi.mock factories are hoisted above the rest of the module, so the class
// referenced inside must be created via vi.hoisted (a plain `class` decl
// referenced from the factory below would otherwise throw a TDZ error).
const { FakeCoinAuthorityBlockedError } = vi.hoisted(() => {
  class FakeCoinAuthorityBlockedError extends Error {
    reason: string;
    constructor(reason: string, symbol: string, message: string) {
      super(message);
      this.reason = reason;
      this.name = 'CoinAuthorityBlockedError';
    }
  }
  return { FakeCoinAuthorityBlockedError };
});
vi.mock('@/lib/coinAuthority', () => ({
  getCoinAuthority: (...args: unknown[]) => getCoinAuthorityMock(...args),
  assertExecutionAllowed: (...args: unknown[]) => assertExecutionAllowedMock(...args),
  CoinAuthorityBlockedError: FakeCoinAuthorityBlockedError,
}));

const createLocalWithdrawalHoldMock = vi.fn();
vi.mock('@/lib/withdrawalOnchain', () => ({
  createLocalWithdrawalHold: (...args: unknown[]) => createLocalWithdrawalHoldMock(...args),
}));

const getUserCoinBalanceMock = vi.fn();
vi.mock('@/lib/localLedger', () => ({
  getUserCoinBalance: (...args: unknown[]) => getUserCoinBalanceMock(...args),
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

import { GET, POST } from './route';

function makeRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return {
    json: async () => body,
    headers: { get: (name: string) => headers[name] ?? null },
  } as unknown as NextRequest;
}

function makeGetRequest(query: Record<string, string> = {}): NextRequest {
  const sp = new URLSearchParams(query);
  return { nextUrl: { searchParams: sp } } as unknown as NextRequest;
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
    getCoinAuthorityMock.mockResolvedValue('HUB'); // HUB-rail tests below assume today's default rail
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

// A-5 (V2-CORE) — LOCAL rail branch. getCoinAuthority()==='LOCAL' must never
// touch the hub (no niaWalletRequest call, no forwardWithdrawalToHub), must
// enforce assertExecutionAllowed(), and must delegate the actual W-1 balance
// check to createLocalWithdrawalHold() (A-3 placeHold, same DB transaction as
// the request-row insert — see web/src/lib/withdrawalOnchain.ts).
describe('POST /api/nia/withdrawals — LOCAL rail (A-5 §3.2)', () => {
  afterEach(() => { vi.clearAllMocks(); });

  function setupLocalDefaults() {
    resolveSessionUserIdMock.mockResolvedValue('nia-user-1');
    authMock.mockResolvedValue({ user: { id: 'db-user-1', email: 'user@test.com' } });
    userFindUniqueMock.mockResolvedValue(null);
    getPlatformSettingsMock.mockResolvedValue(null);
    getCoinAuthorityMock.mockResolvedValue('LOCAL');
    assertExecutionAllowedMock.mockResolvedValue(undefined);
  }

  it('never calls the hub balance/forward path on the LOCAL rail', async () => {
    setupLocalDefaults();
    createLocalWithdrawalHoldMock.mockResolvedValue({ id: 'wr-local-1', status: 'PENDING' });

    const res = await POST(makeRequest({ ...BASE_BODY, amount: '100' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data).toEqual({ id: 'wr-local-1', status: 'PENDING', pendingApproval: true });
    expect(niaWalletRequestMock).not.toHaveBeenCalled();
    expect(forwardWithdrawalToHubMock).not.toHaveBeenCalled();
    expect(withdrawalRequestCreateMock).not.toHaveBeenCalled(); // HUB-only path untouched
    expect(createLocalWithdrawalHoldMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'db-user-1', coin: 'USDT', network: 'TRC20',
        toAddress: 'T-some-address', amount: '100', feeAmount: '0',
      }),
    );
  });

  it('blocks (403) when assertExecutionAllowed throws CoinAuthorityBlockedError (T2_HALTED etc.)', async () => {
    setupLocalDefaults();
    assertExecutionAllowedMock.mockRejectedValue(
      new FakeCoinAuthorityBlockedError('T2_HALTED', 'USDT', 'USDT: T2 violation halt — WITHDRAWAL blocked.'),
    );

    const res = await POST(makeRequest({ ...BASE_BODY, amount: '100' }));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.ok).toBe(false);
    expect(createLocalWithdrawalHoldMock).not.toHaveBeenCalled();
  });

  it('W-1: rejects with a getUserCoinBalance-derived message on INSUFFICIENT_AVAILABLE_BALANCE (not the hub balance)', async () => {
    setupLocalDefaults();
    createLocalWithdrawalHoldMock.mockRejectedValue(
      Object.assign(new Error('placeHold: insufficient available balance'), { code: 'INSUFFICIENT_AVAILABLE_BALANCE' }),
    );
    getUserCoinBalanceMock.mockResolvedValue({ balance: '50', held: '0', available: '50' });

    const res = await POST(makeRequest({ ...BASE_BODY, amount: '100' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/insufficient balance/i);
    expect(json.error).toMatch(/50 USDT/);
    expect(niaWalletRequestMock).not.toHaveBeenCalled(); // never fell back to a hub-balance check
  });

  it('never auto-approves on the LOCAL rail (W-8), even under an autoApproveUnderUsd policy', async () => {
    setupLocalDefaults();
    getPlatformSettingsMock.mockResolvedValue({ autoApproveUnderUsd: '1000' });
    createLocalWithdrawalHoldMock.mockResolvedValue({ id: 'wr-local-2', status: 'PENDING' });

    const res = await POST(makeRequest({ ...BASE_BODY, amount: '1' }));
    const json = await res.json();

    expect(json.data.status).toBe('PENDING');
    expect(forwardWithdrawalToHubMock).not.toHaveBeenCalled();
  });
});

// A-5 §1.8 — authority-aware history merge regression coverage. Must ship in
// the same release as the admin submit-tx endpoint (already shipped) per the
// design doc's explicit "release order" requirement.
describe('GET /api/nia/withdrawals — authority-aware merge (A-5 §1.8)', () => {
  afterEach(() => { vi.clearAllMocks(); });

  function setupGetDefaults() {
    resolveSessionUserIdMock.mockResolvedValue('nia-user-1');
    authMock.mockResolvedValue({ user: { id: 'db-user-1', email: 'user@test.com' } });
    niaWalletRequestMock.mockResolvedValue({ items: [] }); // empty hub history
  }

  it('merges a LOCAL-rail APPROVED request (would previously vanish — the A-5 §1.8 regression)', async () => {
    setupGetDefaults();
    withdrawalRequestFindManyMock.mockResolvedValue([
      {
        id: 'wr-local-approved', amount: '100', currency: 'USDT', network: 'BSC', toAddress: '0xabc',
        status: 'APPROVED', hubTxId: null, balanceAuthorityAtRequest: 'LOCAL',
        onchainTxHash: '0xdeadbeef', onchainVerifiedAt: new Date('2026-08-10T00:00:00.000Z'),
        createdAt: new Date('2026-08-09T00:00:00.000Z'),
      },
    ]);

    const res = await GET(makeGetRequest());
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.items).toHaveLength(1);
    expect(json.data.items[0]).toMatchObject({
      id: 'wr-local-approved', status: 'APPROVED', onchainTxHash: '0xdeadbeef',
    });
  });

  it('merges a LOCAL-rail AWAITING_ONCHAIN request without an onchainTxHash yet', async () => {
    setupGetDefaults();
    withdrawalRequestFindManyMock.mockResolvedValue([
      {
        id: 'wr-local-awaiting', amount: '50', currency: 'USDT', network: 'BSC', toAddress: '0xabc',
        status: 'AWAITING_ONCHAIN', hubTxId: null, balanceAuthorityAtRequest: 'LOCAL',
        onchainTxHash: null, onchainVerifiedAt: null,
        createdAt: new Date('2026-08-09T00:00:00.000Z'),
      },
    ]);

    const res = await GET(makeGetRequest());
    const json = await res.json();

    expect(json.data.items).toHaveLength(1);
    expect(json.data.items[0]).toMatchObject({
      id: 'wr-local-awaiting', status: 'AWAITING_ONCHAIN', onchainTxHash: null, onchainVerifiedAt: null,
    });
  });

  it('still excludes a HUB-rail APPROVED request from the local merge (unchanged HUB behavior)', async () => {
    setupGetDefaults();
    // The mocked prisma findMany doesn't evaluate the `where` clause itself
    // (this is a mock), so this test asserts the *query shape* sent to
    // prisma — the actual filtering is Postgres's job in production. This
    // confirms the OR clause still scopes HUB rows to the non-APPROVED
    // status set, exactly as before this change.
    withdrawalRequestFindManyMock.mockResolvedValue([]);

    await GET(makeGetRequest());

    expect(withdrawalRequestFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'db-user-1',
          OR: [
            { balanceAuthorityAtRequest: 'HUB', status: { in: ['PENDING', 'PROCESSING', 'REJECTED', 'FAILED'] } },
            { balanceAuthorityAtRequest: 'LOCAL' },
          ],
        }),
      }),
    );
  });
});
