// CS-1′ regression coverage (docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md
// §2.2): POST /api/staking/stake (the v1 user execution route) must be
// fail-closed and ALWAYS return 503 STAKE_PATH_MIGRATING, unconditionally —
// not gated on product status/coin/amount/hub balance. PoR's
// activeUserFundedPrincipalTotal (web/src/lib/localLedger.ts) only reads
// StakePositionV2, so any position created through this v1 route would be
// invisible debt to reserve accounting.
import { afterEach, describe, expect, it, vi } from 'vitest';

const requireUserMock = vi.fn();
vi.mock('@/lib/auth/session', () => ({ requireUser: (...args: unknown[]) => requireUserMock(...args) }));

const authMock = vi.fn();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

const resolveSessionUserIdMock = vi.fn();
vi.mock('@/lib/nia/resolve', () => ({ resolveSessionUserId: (...args: unknown[]) => resolveSessionUserIdMock(...args) }));

const niaWalletRequestMock = vi.fn();
vi.mock('@/lib/nia/client', () => ({ niaWalletRequest: (...args: unknown[]) => niaWalletRequestMock(...args) }));

const settleMaturedPositionsMock = vi.fn();
vi.mock('@/lib/staking', () => ({ settleMaturedPositions: (...args: unknown[]) => settleMaturedPositionsMock(...args) }));

vi.mock('@/lib/stakingRenew', () => ({ AUTO_RENEW_MAX_TERM_DAYS: 90 }));

const stakingProductFindUniqueMock = vi.fn();
const stakePositionFindManyMock = vi.fn();
const stakePositionCreateMock = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: {
    stakingProduct: { findUnique: (...args: unknown[]) => stakingProductFindUniqueMock(...args) },
    stakePosition: {
      findMany: (...args: unknown[]) => stakePositionFindManyMock(...args),
      create: (...args: unknown[]) => stakePositionCreateMock(...args),
    },
    $transaction: (fn: unknown) => (fn as (tx: unknown) => unknown)({}),
  },
}));

import { POST } from './route';

function makeRequest(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

describe('POST /api/staking/stake — CS-1′ fail-closed v1 execution block', () => {
  afterEach(() => { vi.clearAllMocks(); });

  function setupAuthed() {
    requireUserMock.mockResolvedValue(undefined);
    resolveSessionUserIdMock.mockResolvedValue('nia-user-1');
    authMock.mockResolvedValue({ user: { id: 'db-user-1', email: 'user@test.com' } });
  }

  it('returns 503 STAKE_PATH_MIGRATING for a well-formed stake against an OPEN product with sufficient balance', async () => {
    setupAuthed();
    stakingProductFindUniqueMock.mockResolvedValue({
      id: 'p1', status: 'OPEN', minAmount: null, maxAmount: null, termDays: 30, dailyRatePct: '0.1', coin: 'BANA', capacity: null,
    });
    niaWalletRequestMock.mockResolvedValue([{ currency: 'BANA', balance: '1000' }]);

    const res = await POST(makeRequest({ productId: 'p1', amount: '10' }));
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('STAKE_PATH_MIGRATING');
    expect(stakePositionCreateMock).not.toHaveBeenCalled();
    // The route must reject before touching the hub or the DB at all.
    expect(niaWalletRequestMock).not.toHaveBeenCalled();
    expect(stakingProductFindUniqueMock).not.toHaveBeenCalled();
    expect(settleMaturedPositionsMock).not.toHaveBeenCalled();
  });

  it('returns 503 STAKE_PATH_MIGRATING for a stake against a CLOSED / missing product', async () => {
    setupAuthed();
    stakingProductFindUniqueMock.mockResolvedValue(null);

    const res = await POST(makeRequest({ productId: 'does-not-exist', amount: '10' }));
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.code).toBe('STAKE_PATH_MIGRATING');
  });

  it('returns 503 STAKE_PATH_MIGRATING for a completely empty/garbage body', async () => {
    setupAuthed();

    const res = await POST(makeRequest({}));
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.code).toBe('STAKE_PATH_MIGRATING');
  });

  it('returns 503 STAKE_PATH_MIGRATING even when the request body cannot be parsed as JSON', async () => {
    setupAuthed();
    const req = { json: async () => { throw new Error('bad json'); } } as unknown as Request;

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.code).toBe('STAKE_PATH_MIGRATING');
  });

  it('still enforces user auth before the fail-closed response', async () => {
    requireUserMock.mockRejectedValue(Object.assign(new Error('Unauthorized'), { status: 401, code: 'UNAUTHENTICATED' }));

    const res = await POST(makeRequest({ productId: 'p1', amount: '10' }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.code).toBe('UNAUTHENTICATED');
    expect(stakePositionCreateMock).not.toHaveBeenCalled();
  });
});
