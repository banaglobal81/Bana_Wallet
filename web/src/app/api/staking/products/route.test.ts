// docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md §5.2①
// (CUT-4 / T-7) regression coverage for GET /api/staking/products:
//   - reads StakingProductV2 (not the legacy v1 table), OPEN only
//   - response field `baseDailyRatePct` (not `dailyRatePct`)
//   - capacity usage aggregated from StakePositionV2 (not the legacy table)
import { afterEach, describe, expect, it, vi } from 'vitest';

const requireUserMock = vi.fn();
vi.mock('@/lib/auth/session', () => ({ requireUser: (...args: unknown[]) => requireUserMock(...args) }));

const stakingProductV2FindManyMock = vi.fn();
const stakePositionV2FindManyMock = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: {
    stakingProductV2: { findMany: (...args: unknown[]) => stakingProductV2FindManyMock(...args) },
    stakePositionV2: { findMany: (...args: unknown[]) => stakePositionV2FindManyMock(...args) },
  },
}));

import { GET } from './route';

describe('GET /api/staking/products — V2 (CUT-4 / T-7)', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('401s before touching the DB when unauthenticated', async () => {
    requireUserMock.mockRejectedValue(Object.assign(new Error('Unauthorized'), { status: 401 }));

    const res = await GET();

    expect(res.status).toBe(401);
    expect(stakingProductV2FindManyMock).not.toHaveBeenCalled();
  });

  it('reads only OPEN StakingProductV2 rows and returns baseDailyRatePct (not dailyRatePct)', async () => {
    requireUserMock.mockResolvedValue(undefined);
    stakingProductV2FindManyMock.mockResolvedValue([
      { id: 'p1', coin: 'BANA', name: '10-Day BANA', termDays: 10, baseDailyRatePct: '0.2', minAmount: '100', maxAmount: '3000', capacity: '30000' },
    ]);
    stakePositionV2FindManyMock.mockResolvedValue([]);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(stakingProductV2FindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'OPEN' } }),
    );
    expect(json.data[0]).toMatchObject({ id: 'p1', baseDailyRatePct: '0.2', capacity: '30000', remaining: '30000', full: false });
    expect(json.data[0].dailyRatePct).toBeUndefined();
  });

  it('computes remaining/full capacity from StakePositionV2 (V2 positions only), not the legacy v1 table', async () => {
    requireUserMock.mockResolvedValue(undefined);
    stakingProductV2FindManyMock.mockResolvedValue([
      { id: 'p1', coin: 'BANA', name: '10-Day BANA', termDays: 10, baseDailyRatePct: '0.2', minAmount: '100', maxAmount: '3000', capacity: '1000' },
    ]);
    stakePositionV2FindManyMock.mockResolvedValue([
      { productId: 'p1', principal: '400' },
      { productId: 'p1', principal: '600' },
    ]);

    const res = await GET();
    const json = await res.json();

    expect(stakePositionV2FindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'ACTIVE' } }),
    );
    expect(json.data[0]).toMatchObject({ remaining: '0', full: true });
  });

  it('returns remaining=null when a product has no capacity cap (never divides by a null cap)', async () => {
    requireUserMock.mockResolvedValue(undefined);
    stakingProductV2FindManyMock.mockResolvedValue([
      { id: 'p1', coin: 'BANA', name: '180-Day BANA', termDays: 180, baseDailyRatePct: '0', minAmount: '100', maxAmount: '1000', capacity: null },
    ]);
    stakePositionV2FindManyMock.mockResolvedValue([]);

    const res = await GET();
    const json = await res.json();

    expect(json.data[0]).toMatchObject({ remaining: null, full: false });
  });
});
