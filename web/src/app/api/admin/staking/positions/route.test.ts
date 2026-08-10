// docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md §5.1 CUT-2 /
// T-5 regression coverage.
//
// Replaces the old CS-1′ "POST always 409" suite: CUT-2 permanently REMOVES the
// admin grant POST handler (rev04 §1.8 G-E — "V2-CORE에서 그랜트 기능은 제공하지
// 않는다" is the permanent policy; CS-1′'s 409 was only the interim measure while
// this route still exported a POST at all). This suite instead asserts:
//   1. There is no POST export left in the module (a caller now gets Next.js's
//      default 405, not a 409 JSON body — the removal must be real, not renamed).
//   2. GET reads StakePositionV2 (not the legacy v1 table) and serializes the V2
//      field set (no `accruedInterest`, `ledgeredYield` not `paidInterest`,
//      `baseDailyRatePct` not `dailyRatePct`, no `PAID` status).
import { afterEach, describe, expect, it, vi } from 'vitest';

const requireAdminMock = vi.fn();
vi.mock('@/lib/auth/session', () => ({ requireAdmin: (...args: unknown[]) => requireAdminMock(...args) }));

const settleMaturedPositionsV2Mock = vi.fn();
vi.mock('@/lib/stakingV2', () => ({
  settleMaturedPositionsV2: (...args: unknown[]) => settleMaturedPositionsV2Mock(...args),
}));

const stakePositionV2FindManyMock = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: {
    stakePositionV2: { findMany: (...args: unknown[]) => stakePositionV2FindManyMock(...args) },
  },
}));

describe('GET /api/admin/staking/positions — V2', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('403s before touching the DB when the caller is not an admin', async () => {
    const { GET } = await import('./route');
    requireAdminMock.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.ok).toBe(false);
    expect(stakePositionV2FindManyMock).not.toHaveBeenCalled();
  });

  it('lazily settles matured positions before reading, then returns the V2 field set', async () => {
    const { GET } = await import('./route');
    requireAdminMock.mockResolvedValue({ id: 'admin-1', email: 'admin@test.com' });
    settleMaturedPositionsV2Mock.mockResolvedValue(undefined);
    stakePositionV2FindManyMock.mockResolvedValue([
      {
        id: 'pos-1', productId: 'prod-1', coin: 'BANA', principal: '100',
        baseDailyRatePct: '0.2', termDays: 10,
        startAt: new Date('2026-08-01T00:00:00.000Z'), maturityAt: new Date('2026-08-11T00:00:00.000Z'),
        status: 'ACTIVE', ledgeredYield: '0.4', daysPaid: 2,
        autoRenew: false, renewalStatus: 'NONE', renewedIntoPositionId: null, renewedFromPositionId: null,
        grantedByAdminId: null, fundingSource: 'USER_BALANCE', email: 'user@test.com',
        product: { name: '10-Day BANA' },
      },
    ]);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(settleMaturedPositionsV2Mock).toHaveBeenCalledTimes(1);
    expect(stakePositionV2FindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' }, take: 200 }),
    );

    const [row] = json.data;
    expect(row).toMatchObject({
      id: 'pos-1', productId: 'prod-1', coin: 'BANA', principal: '100',
      baseDailyRatePct: '0.2', termDays: 10, status: 'ACTIVE',
      ledgeredYield: '0.4', daysPaid: 2, email: 'user@test.com', productName: '10-Day BANA',
      isGrant: false,
    });
    // Banned V2 concept (rev05 §5.2 ①) — must never reappear on the admin response.
    expect(row.accruedInterest).toBeUndefined();
    expect(row.paidInterest).toBeUndefined();
    expect(row.dailyRatePct).toBeUndefined();
  });

  it('marks a PLATFORM_GRANT-funded position as isGrant (forward-compat; unreachable via any live creation path today)', async () => {
    const { GET } = await import('./route');
    requireAdminMock.mockResolvedValue({ id: 'admin-1', email: 'admin@test.com' });
    settleMaturedPositionsV2Mock.mockResolvedValue(undefined);
    stakePositionV2FindManyMock.mockResolvedValue([
      {
        id: 'pos-2', productId: 'prod-1', coin: 'BANA', principal: '50',
        baseDailyRatePct: '0.2', termDays: 10,
        startAt: new Date(), maturityAt: new Date(),
        status: 'ACTIVE', ledgeredYield: '0', daysPaid: 0,
        autoRenew: false, renewalStatus: 'NONE', renewedIntoPositionId: null, renewedFromPositionId: null,
        grantedByAdminId: 'admin-1', fundingSource: 'PLATFORM_GRANT', email: 'user@test.com',
        product: { name: '10-Day BANA' },
      },
    ]);

    const res = await GET();
    const json = await res.json();
    expect(json.data[0].isGrant).toBe(true);
  });
});

describe('POST /api/admin/staking/positions — permanently removed (CUT-2)', () => {
  it('the route module exports no POST handler', async () => {
    const mod = await import('./route');
    expect((mod as Record<string, unknown>).POST).toBeUndefined();
  });
});
