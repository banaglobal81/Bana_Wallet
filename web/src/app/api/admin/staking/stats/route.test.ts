// docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md §5.1 CUT-2 /
// T-5 coverage — reads StakePositionV2 now, and `settledStatusCount` is a
// structural 0 (StakePositionV2Status has no PAID member at all, unlike v1).
import { afterEach, describe, expect, it, vi } from 'vitest';

const requireAdminMock = vi.fn();
vi.mock('@/lib/auth/session', () => ({ requireAdmin: (...args: unknown[]) => requireAdminMock(...args) }));

const queryRawMock = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: { $queryRaw: (...args: unknown[]) => queryRawMock(...args) },
}));

import { GET } from './route';

describe('GET /api/admin/staking/stats', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('403s before querying when the caller is not an admin', async () => {
    requireAdminMock.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    const res = await GET();
    expect(res.status).toBe(403);
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it('adds the structural hubSettled/settledStatusCount fields onto each V2 row', async () => {
    requireAdminMock.mockResolvedValue({ id: 'admin-1', email: 'admin@test.com' });
    queryRawMock.mockResolvedValue([
      {
        coin: 'BANA', activePrincipal: '1000', grantedActivePrincipal: '0',
        ledgeredInterest: '4', unpaidInterest: '4', dailyAccrualRate: '2',
        activeCount: 1, maturedCount: 0, totalCount: 1,
      },
    ]);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data[0]).toMatchObject({
      coin: 'BANA', ledgeredInterest: '4', hubSettled: '0', hubSettledStatus: 'NO_RAIL', settledStatusCount: 0,
    });
  });
});
