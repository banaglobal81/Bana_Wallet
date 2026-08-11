// docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md §5.2①
// (CUT-4 / T-7) regression coverage for POST /api/staking/stake, the V2
// rewrite that replaced the CS-1′ fail-closed 503 STAKE_PATH_MIGRATING stub
// this file used to test. Covers:
//   - R-AR-2 (docs/specs/staking-v2-auto-renew-cutover-ruling.md §5.1): the
//     mere PRESENCE of an `autoRenew` key in the body is rejected 409
//     AUTO_RENEW_UNAVAILABLE, before any product/amount validation and
//     before any DB/createStakePositionV2 call — value irrelevant.
//   - CP-2 / the coin-authority fail-closed backstop (ⓑ): a non-LOCAL coin
//     is rejected 503 STAKE_COIN_AUTHORITY_UNSUPPORTED before
//     createStakePositionV2 is ever called.
//   - createStakePositionV2 delegation: the success path (200, id +
//     maturityAt passed through) and the error-mapping path (its own
//     {code,status} errors passed through unchanged; CoinAuthorityBlockedError
//     mapped to 403 + a STAKE_-prefixed code; placeHold's
//     INSUFFICIENT_AVAILABLE_BALANCE mapped to 400 STAKE_INSUFFICIENT_LOCAL_BALANCE).
//   - Auth is still enforced before any of the above.
import { afterEach, describe, expect, it, vi } from 'vitest';

const requireUserMock = vi.fn();
vi.mock('@/lib/auth/session', () => ({ requireUser: (...args: unknown[]) => requireUserMock(...args) }));

const authMock = vi.fn();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

const settleMaturedPositionsMock = vi.fn();
vi.mock('@/lib/staking', () => ({ settleMaturedPositions: (...args: unknown[]) => settleMaturedPositionsMock(...args) }));

const createStakePositionV2Mock = vi.fn();
vi.mock('@/lib/stakingV2', () => ({ createStakePositionV2: (...args: unknown[]) => createStakePositionV2Mock(...args) }));

const getCoinAuthorityMock = vi.fn();
// vi.mock factories are hoisted above the rest of the module, so the class
// referenced inside must be created via vi.hoisted (a plain `class` decl
// referenced from the factory below would otherwise throw a TDZ error) —
// same pattern as api/nia/withdrawals/route.test.ts.
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
  getCoinAuthority: (...args: unknown[]) => getCoinAuthorityMock(...args),
  CoinAuthorityBlockedError: FakeCoinAuthorityBlockedError,
}));

const stakingProductV2FindUniqueMock = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: {
    stakingProductV2: { findUnique: (...args: unknown[]) => stakingProductV2FindUniqueMock(...args) },
  },
}));

import { POST } from './route';

function makeRequest(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

describe('POST /api/staking/stake — V2 (CUT-4 / T-7)', () => {
  afterEach(() => { vi.clearAllMocks(); });

  function setupAuthed() {
    requireUserMock.mockResolvedValue(undefined);
    authMock.mockResolvedValue({ user: { id: 'db-user-1', email: 'user@test.com' } });
  }

  it('still enforces user auth before anything else', async () => {
    requireUserMock.mockRejectedValue(Object.assign(new Error('Unauthorized'), { status: 401, code: 'UNAUTHENTICATED' }));

    const res = await POST(makeRequest({ productId: 'p1', amount: '10' }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.code).toBe('UNAUTHENTICATED');
    expect(stakingProductV2FindUniqueMock).not.toHaveBeenCalled();
    expect(createStakePositionV2Mock).not.toHaveBeenCalled();
  });

  describe('R-AR-2 — autoRenew field presence is rejected before any other check', () => {
    it('rejects 409 AUTO_RENEW_UNAVAILABLE when autoRenew:true is present', async () => {
      setupAuthed();

      const res = await POST(makeRequest({ productId: 'p1', amount: '10', autoRenew: true }));
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.ok).toBe(false);
      expect(json.code).toBe('AUTO_RENEW_UNAVAILABLE');
      // Rejected before touching the product, the coin-authority check, or
      // createStakePositionV2 at all.
      expect(stakingProductV2FindUniqueMock).not.toHaveBeenCalled();
      expect(getCoinAuthorityMock).not.toHaveBeenCalled();
      expect(createStakePositionV2Mock).not.toHaveBeenCalled();
    });

    it('rejects 409 AUTO_RENEW_UNAVAILABLE even when autoRenew:false is present — value is irrelevant, only presence matters', async () => {
      setupAuthed();

      const res = await POST(makeRequest({ productId: 'p1', amount: '10', autoRenew: false }));
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.code).toBe('AUTO_RENEW_UNAVAILABLE');
      expect(createStakePositionV2Mock).not.toHaveBeenCalled();
    });

    it('does NOT reject when the body has no autoRenew key at all', async () => {
      setupAuthed();
      stakingProductV2FindUniqueMock.mockResolvedValue({ id: 'p1', coin: 'BANA' });
      getCoinAuthorityMock.mockResolvedValue('LOCAL');
      createStakePositionV2Mock.mockResolvedValue({ id: 'pos-1', maturityAt: '2026-09-10T00:00:00.000Z' });

      const res = await POST(makeRequest({ productId: 'p1', amount: '10' }));

      expect(res.status).toBe(200);
      expect(createStakePositionV2Mock).toHaveBeenCalledTimes(1);
    });
  });

  it('rejects 400 STAKE_INVALID_AMOUNT for a non-positive amount, before any DB/coin-authority call', async () => {
    setupAuthed();

    const res = await POST(makeRequest({ productId: 'p1', amount: '0' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe('STAKE_INVALID_AMOUNT');
    expect(stakingProductV2FindUniqueMock).not.toHaveBeenCalled();
    expect(createStakePositionV2Mock).not.toHaveBeenCalled();
  });

  it('rejects 404 STAKE_PRODUCT_NOT_FOUND when the product does not exist', async () => {
    setupAuthed();
    stakingProductV2FindUniqueMock.mockResolvedValue(null);

    const res = await POST(makeRequest({ productId: 'missing', amount: '10' }));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.code).toBe('STAKE_PRODUCT_NOT_FOUND');
    expect(getCoinAuthorityMock).not.toHaveBeenCalled();
    expect(createStakePositionV2Mock).not.toHaveBeenCalled();
  });

  describe('ⓑ coin-authority fail-closed backstop', () => {
    it('rejects 503 STAKE_COIN_AUTHORITY_UNSUPPORTED when the product coin is not LOCAL-authority', async () => {
      setupAuthed();
      stakingProductV2FindUniqueMock.mockResolvedValue({ id: 'p1', coin: 'BANA' });
      getCoinAuthorityMock.mockResolvedValue('HUB');

      const res = await POST(makeRequest({ productId: 'p1', amount: '10' }));
      const json = await res.json();

      expect(res.status).toBe(503);
      expect(json.code).toBe('STAKE_COIN_AUTHORITY_UNSUPPORTED');
      expect(settleMaturedPositionsMock).not.toHaveBeenCalled();
      expect(createStakePositionV2Mock).not.toHaveBeenCalled();
    });
  });

  describe('createStakePositionV2 delegation', () => {
    it('success: settles matured positions first, then delegates, then returns 200 with id + maturityAt', async () => {
      setupAuthed();
      stakingProductV2FindUniqueMock.mockResolvedValue({ id: 'p1', coin: 'BANA' });
      getCoinAuthorityMock.mockResolvedValue('LOCAL');
      createStakePositionV2Mock.mockResolvedValue({ id: 'pos-1', maturityAt: '2026-09-10T00:00:00.000Z' });

      const res = await POST(makeRequest({ productId: 'p1', amount: '10' }));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.data).toEqual({ id: 'pos-1', maturityAt: '2026-09-10T00:00:00.000Z' });

      expect(settleMaturedPositionsMock).toHaveBeenCalledWith('db-user-1');
      expect(createStakePositionV2Mock).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'db-user-1',
          email: 'user@test.com',
          coin: 'BANA',
          productId: 'p1',
          principal: '10',
          fundingSource: 'USER_BALANCE',
        }),
      );
      // Ordering: settle-then-create, not the other way around.
      expect(settleMaturedPositionsMock.mock.invocationCallOrder[0])
        .toBeLessThan(createStakePositionV2Mock.mock.invocationCallOrder[0]);
    });

    it('passes createStakePositionV2\'s own {code,status} errors through unchanged (e.g. STAKE_PRODUCT_CLOSED)', async () => {
      setupAuthed();
      stakingProductV2FindUniqueMock.mockResolvedValue({ id: 'p1', coin: 'BANA' });
      getCoinAuthorityMock.mockResolvedValue('LOCAL');
      createStakePositionV2Mock.mockRejectedValue(
        Object.assign(new Error('createStakePositionV2: product is closed.'), { code: 'STAKE_PRODUCT_CLOSED', status: 409 }),
      );

      const res = await POST(makeRequest({ productId: 'p1', amount: '10' }));
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.code).toBe('STAKE_PRODUCT_CLOSED');
    });

    it('maps a CoinAuthorityBlockedError (T2_HALTED) from createStakePositionV2 to 403 STAKE_COIN_HALTED', async () => {
      setupAuthed();
      stakingProductV2FindUniqueMock.mockResolvedValue({ id: 'p1', coin: 'BANA' });
      getCoinAuthorityMock.mockResolvedValue('LOCAL');
      createStakePositionV2Mock.mockRejectedValue(
        new FakeCoinAuthorityBlockedError('T2_HALTED', 'BANA', 'BANA: T2 violation halt — NEW_POSITION blocked.'),
      );

      const res = await POST(makeRequest({ productId: 'p1', amount: '10' }));
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.code).toBe('STAKE_COIN_HALTED');
    });

    it('maps placeHold\'s INSUFFICIENT_AVAILABLE_BALANCE (thrown inside createStakePositionV2) to 400 STAKE_INSUFFICIENT_LOCAL_BALANCE', async () => {
      setupAuthed();
      stakingProductV2FindUniqueMock.mockResolvedValue({ id: 'p1', coin: 'BANA' });
      getCoinAuthorityMock.mockResolvedValue('LOCAL');
      createStakePositionV2Mock.mockRejectedValue(
        Object.assign(new Error('placeHold: insufficient available balance for db-user-1/BANA.'), { code: 'INSUFFICIENT_AVAILABLE_BALANCE' }),
      );

      const res = await POST(makeRequest({ productId: 'p1', amount: '10' }));
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.code).toBe('STAKE_INSUFFICIENT_LOCAL_BALANCE');
    });
  });
});
