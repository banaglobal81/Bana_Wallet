// docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md §5.1 CUT-2 /
// T-5 — CP-5′ (initial V2 product creation) coverage for
// GET/POST /api/admin/staking/products.
import { afterEach, describe, expect, it, vi } from 'vitest';

const requireAdminMock = vi.fn();
vi.mock('@/lib/auth/session', () => ({ requireAdmin: (...args: unknown[]) => requireAdminMock(...args) }));

const recordAuditMock = vi.fn();
vi.mock('@/lib/audit', () => ({ recordAudit: (...args: unknown[]) => recordAuditMock(...args) }));

const stakingProductV2FindManyMock = vi.fn();
const stakingProductV2CreateMock = vi.fn();
const stakePositionV2FindManyMock = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: {
    stakingProductV2: {
      findMany: (...args: unknown[]) => stakingProductV2FindManyMock(...args),
      create: (...args: unknown[]) => stakingProductV2CreateMock(...args),
    },
    stakePositionV2: { findMany: (...args: unknown[]) => stakePositionV2FindManyMock(...args) },
  },
}));

import { GET, POST } from './route';

const ADMIN = { id: 'admin-1', email: 'admin@test.com' };

function req(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

// rev05 §4.3 CP-5′'s exact 10-day row — the smallest worked example in the doc.
function validBody(overrides: Record<string, unknown> = {}) {
  return {
    coin: 'BANA', name: '10-Day BANA', termDays: 10,
    baseDailyRatePct: '0.2', minAmount: '100', maxAmount: '3000', capacity: '30000',
    ...overrides,
  };
}

describe('GET /api/admin/staking/products', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('403s before touching the DB when the caller is not an admin', async () => {
    requireAdminMock.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    const res = await GET();
    expect(res.status).toBe(403);
    expect(stakingProductV2FindManyMock).not.toHaveBeenCalled();
  });

  it('returns V2 products with computed totals, aprPct, and the maxBonusPctOfBase field', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    stakingProductV2FindManyMock.mockResolvedValue([
      {
        id: 'p1', coin: 'BANA', name: '10-Day BANA', termDays: 10,
        baseDailyRatePct: '0.2', maxBonusPctOfBase: '0',
        minAmount: '100', maxAmount: '3000', capacity: '30000',
        status: 'CLOSED', createdAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    ]);
    stakePositionV2FindManyMock.mockResolvedValue([
      { productId: 'p1', principal: '500', autoRenew: true },
      { productId: 'p1', principal: '250', autoRenew: false },
    ]);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data[0]).toMatchObject({
      id: 'p1', baseDailyRatePct: '0.2', aprPct: '73.00', maxBonusPctOfBase: '0',
      status: 'CLOSED', totalStaked: '750', positionCount: 2, autoRenewActiveCount: 1,
    });
    expect(json.data[0].dailyRatePct).toBeUndefined();
  });
});

describe('POST /api/admin/staking/products — CP-5′', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('403s before touching the DB when the caller is not an admin', async () => {
    requireAdminMock.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    const res = await POST(req(validBody()));
    expect(res.status).toBe(403);
    expect(stakingProductV2CreateMock).not.toHaveBeenCalled();
  });

  it('creates a product forced to CLOSED even when the caller sends status: "OPEN" (§10-24)', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    stakingProductV2CreateMock.mockResolvedValue({ id: 'p1' });

    const res = await POST(req(validBody({ status: 'OPEN' })));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(stakingProductV2CreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CLOSED' }) }),
    );
    expect(recordAuditMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'STAKING_PRODUCT_V2_CREATE' }));
  });

  it('rejects a non-BANA coin', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    const res = await POST(req(validBody({ coin: 'USDT' })));
    expect(res.status).toBe(400);
    expect(stakingProductV2CreateMock).not.toHaveBeenCalled();
  });

  it('rejects a termDays value off the §4.2 ladder', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    const res = await POST(req(validBody({ termDays: 45 })));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe('STAKE_PRODUCT_TERM_INVALID');
    expect(stakingProductV2CreateMock).not.toHaveBeenCalled();
  });

  it.each(['minAmount', 'maxAmount', 'capacity', 'baseDailyRatePct'])(
    'rejects a missing %s (CP-5′ — non-null required at creation)',
    async (field) => {
      requireAdminMock.mockResolvedValue(ADMIN);
      const res = await POST(req(validBody({ [field]: '' })));
      expect(res.status).toBe(400);
      expect(stakingProductV2CreateMock).not.toHaveBeenCalled();
    },
  );

  it('accepts baseDailyRatePct "0" (the 180/360-day CP-7′ placeholder shape)', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    stakingProductV2CreateMock.mockResolvedValue({ id: 'p360' });
    const res = await POST(req(validBody({ termDays: 360, baseDailyRatePct: '0', capacity: '0' })));
    expect(res.status).toBe(200);
    expect(stakingProductV2CreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ baseDailyRatePct: '0', capacity: '0', status: 'CLOSED' }) }),
    );
  });

  it('rejects maxAmount below minAmount', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    const res = await POST(req(validBody({ minAmount: '1000', maxAmount: '500' })));
    expect(res.status).toBe(400);
    expect(stakingProductV2CreateMock).not.toHaveBeenCalled();
  });

  it('AC-C12 — rejects a nonzero maxBonusPctOfBase (V2-BAND gate)', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    const res = await POST(req(validBody({ maxBonusPctOfBase: '5' })));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe('STAKE_PRODUCT_BAND_NOT_SUPPORTED');
    expect(stakingProductV2CreateMock).not.toHaveBeenCalled();
  });

  // --- qa-lead FAIL fix: CP-7′ (rev05 §4.5) must be route-enforced, not a UI convention ---
  describe('CP-7′ — 180/360-day terms are locked to capacity/rate "0"', () => {
    it('rejects a 180-day product with a nonzero rate, even with capacity "0"', async () => {
      requireAdminMock.mockResolvedValue(ADMIN);
      const res = await POST(req(validBody({ termDays: 180, baseDailyRatePct: '1', capacity: '0' })));
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.code).toBe('STAKE_PRODUCT_TERM_NOT_FIRST_TRANCHE');
      expect(stakingProductV2CreateMock).not.toHaveBeenCalled();
    });

    it('rejects a 360-day product with a nonzero capacity, even with rate "0"', async () => {
      requireAdminMock.mockResolvedValue(ADMIN);
      const res = await POST(req(validBody({ termDays: 360, baseDailyRatePct: '0', capacity: '1000000' })));
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.code).toBe('STAKE_PRODUCT_TERM_NOT_FIRST_TRANCHE');
      expect(stakingProductV2CreateMock).not.toHaveBeenCalled();
    });

    it('accepts a 180-day product when both rate AND capacity are exactly "0"', async () => {
      requireAdminMock.mockResolvedValue(ADMIN);
      stakingProductV2CreateMock.mockResolvedValue({ id: 'p180' });
      const res = await POST(req(validBody({ termDays: 180, baseDailyRatePct: '0', capacity: '0' })));
      expect(res.status).toBe(200);
      expect(stakingProductV2CreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ termDays: 180, baseDailyRatePct: '0', capacity: '0' }) }),
      );
    });

    it('never applies the CP-7′ gate to first-tranche terms (10/30/90) — nonzero rate/capacity is fine there', async () => {
      requireAdminMock.mockResolvedValue(ADMIN);
      stakingProductV2CreateMock.mockResolvedValue({ id: 'p90' });
      const res = await POST(req(validBody({ termDays: 90, baseDailyRatePct: '0.7', capacity: '10000' })));
      expect(res.status).toBe(200);
    });
  });
});
