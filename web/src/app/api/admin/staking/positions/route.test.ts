// CS-1′ regression coverage (docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md
// §2.2): POST /api/admin/staking/positions (the admin grant route) must be
// fail-closed and return 409 GRANT_DISABLED_V2_CORE for EVERY input — not just
// a CLOSED product. rev04 G-E ("V2-CORE offers no grant path") was previously
// applied only to the V2 path and never to this still-live v1 route, so a
// grant against an OPEN product (or any product/body at all) could create a
// v1 StakePosition row that PoR's grantPrincipalPayableTotal (which only
// reads StakePositionV2) never sees — invisible debt. This suite asserts the
// block is unconditional, not merely `product.status !== 'OPEN'`.
import { afterEach, describe, expect, it, vi } from 'vitest';

const requireAdminMock = vi.fn();
vi.mock('@/lib/auth/session', () => ({ requireAdmin: (...args: unknown[]) => requireAdminMock(...args) }));

const recordAuditMock = vi.fn();
vi.mock('@/lib/audit', () => ({ recordAudit: (...args: unknown[]) => recordAuditMock(...args) }));

const settleMaturedPositionsMock = vi.fn();
const serializePositionMock = vi.fn();
vi.mock('@/lib/staking', () => ({
  settleMaturedPositions: (...args: unknown[]) => settleMaturedPositionsMock(...args),
  serializePosition: (...args: unknown[]) => serializePositionMock(...args),
}));

const userFindUniqueMock = vi.fn();
const stakingProductFindUniqueMock = vi.fn();
const stakePositionCreateMock = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUniqueMock(...args) },
    stakingProduct: { findUnique: (...args: unknown[]) => stakingProductFindUniqueMock(...args) },
    stakePosition: { create: (...args: unknown[]) => stakePositionCreateMock(...args) },
  },
}));

import { POST } from './route';

function makeRequest(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

describe('POST /api/admin/staking/positions — CS-1′ fail-closed grant block', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('returns 409 GRANT_DISABLED_V2_CORE for a well-formed grant against an OPEN product', async () => {
    requireAdminMock.mockResolvedValue({ id: 'admin-1', email: 'admin@test.com' });
    userFindUniqueMock.mockResolvedValue({ id: 'u1', email: 'user@test.com', niaUserId: 'nia-1' });
    stakingProductFindUniqueMock.mockResolvedValue({
      id: 'p1', status: 'OPEN', minAmount: null, maxAmount: null, termDays: 30, dailyRatePct: '0.1', coin: 'BANA', name: 'Test',
    });

    const res = await POST(makeRequest({ email: 'user@test.com', productId: 'p1', amount: '100' }));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('GRANT_DISABLED_V2_CORE');
    expect(stakePositionCreateMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
    // The route must reject before touching the DB at all — not merely
    // reject the DB write after doing lookups.
    expect(userFindUniqueMock).not.toHaveBeenCalled();
    expect(stakingProductFindUniqueMock).not.toHaveBeenCalled();
  });

  it('returns 409 GRANT_DISABLED_V2_CORE for a grant against a CLOSED product', async () => {
    requireAdminMock.mockResolvedValue({ id: 'admin-1', email: 'admin@test.com' });
    stakingProductFindUniqueMock.mockResolvedValue({
      id: 'p1', status: 'CLOSED', minAmount: null, maxAmount: null, termDays: 30, dailyRatePct: '0.1', coin: 'BANA', name: 'Test',
    });

    const res = await POST(makeRequest({ email: 'user@test.com', productId: 'p1', amount: '100' }));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe('GRANT_DISABLED_V2_CORE');
    expect(stakePositionCreateMock).not.toHaveBeenCalled();
  });

  it('returns 409 GRANT_DISABLED_V2_CORE for a completely empty/garbage body', async () => {
    requireAdminMock.mockResolvedValue({ id: 'admin-1', email: 'admin@test.com' });

    const res = await POST(makeRequest({}));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe('GRANT_DISABLED_V2_CORE');
    expect(stakePositionCreateMock).not.toHaveBeenCalled();
  });

  it('returns 409 GRANT_DISABLED_V2_CORE even when the request body cannot be parsed as JSON', async () => {
    requireAdminMock.mockResolvedValue({ id: 'admin-1', email: 'admin@test.com' });
    const req = { json: async () => { throw new Error('bad json'); } } as unknown as Request;

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe('GRANT_DISABLED_V2_CORE');
  });

  it('still enforces admin auth before the fail-closed response', async () => {
    requireAdminMock.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));

    const res = await POST(makeRequest({ email: 'user@test.com', productId: 'p1', amount: '100' }));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.code).toBeUndefined();
    expect(stakePositionCreateMock).not.toHaveBeenCalled();
  });
});
