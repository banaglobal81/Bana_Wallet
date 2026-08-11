// docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md §5.2①
// (CUT-4 / T-7) regression coverage for GET /api/staking/rewards:
//   - reads StakeYieldLedgerEntry (not the legacy stakingPayout table)
//   - `settledAt` (not `paidAt`) both as the DB filter/order column and the
//     JSON field returned
//   - totalByCoin sums StakePositionV2.ledgeredYield (the cache), not a v1
//     paidInterest sum
//   - the four pagination modes ((none) / since / positionId / cursor+limit)
//     keep their exact pre-existing meaning (rev05 §5.2①: "정확히 보존")
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const requireUserMock = vi.fn();
vi.mock('@/lib/auth/session', () => ({ requireUser: (...args: unknown[]) => requireUserMock(...args) }));

const authMock = vi.fn();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

const stakePositionV2FindFirstMock = vi.fn();
const stakePositionV2FindManyMock = vi.fn();
const stakeYieldLedgerEntryFindManyMock = vi.fn();
const stakeYieldLedgerEntryCountMock = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: {
    stakePositionV2: {
      findFirst: (...args: unknown[]) => stakePositionV2FindFirstMock(...args),
      findMany: (...args: unknown[]) => stakePositionV2FindManyMock(...args),
    },
    stakeYieldLedgerEntry: {
      findMany: (...args: unknown[]) => stakeYieldLedgerEntryFindManyMock(...args),
      count: (...args: unknown[]) => stakeYieldLedgerEntryCountMock(...args),
    },
  },
}));

import { GET } from './route';

function makeReq(qs: string): NextRequest {
  return { nextUrl: { searchParams: new URLSearchParams(qs) } } as unknown as NextRequest;
}

describe('GET /api/staking/rewards — V2 (CUT-4 / T-7)', () => {
  afterEach(() => { vi.clearAllMocks(); });

  function setupAuthed() {
    requireUserMock.mockResolvedValue(undefined);
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    stakeYieldLedgerEntryFindManyMock.mockResolvedValue([]);
    stakeYieldLedgerEntryCountMock.mockResolvedValue(0);
    stakePositionV2FindManyMock.mockResolvedValue([]);
  }

  it('401s before touching the DB when unauthenticated', async () => {
    requireUserMock.mockRejectedValue(Object.assign(new Error('Unauthorized'), { status: 401 }));

    const res = await GET(makeReq(''));

    expect(res.status).toBe(401);
    expect(stakeYieldLedgerEntryFindManyMock).not.toHaveBeenCalled();
  });

  it('totalByCoin sums StakePositionV2.ledgeredYield (the cache), never a raw ledger SUM here', async () => {
    setupAuthed();
    stakePositionV2FindManyMock.mockResolvedValue([
      { coin: 'BANA', ledgeredYield: '4' },
      { coin: 'BANA', ledgeredYield: '2.5' },
    ]);

    const res = await GET(makeReq(''));
    const json = await res.json();

    expect(json.data.totalByCoin).toEqual({ BANA: '6.5' });
  });

  it('default mode (no query params): most recent 20, ordered settledAt desc, id desc — via StakeYieldLedgerEntry', async () => {
    setupAuthed();

    const res = await GET(makeReq(''));
    await res.json();

    expect(stakeYieldLedgerEntryFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        orderBy: [{ settledAt: 'desc' }, { id: 'desc' }],
        take: 21,
      }),
    );
  });

  it('since mode: settledAt > since (not paidAt), oldest-first, default page size 50', async () => {
    setupAuthed();

    const res = await GET(makeReq('since=2026-08-01T00:00:00.000Z'));
    await res.json();

    expect(stakeYieldLedgerEntryFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', settledAt: { gt: new Date('2026-08-01T00:00:00.000Z') } },
        orderBy: [{ settledAt: 'asc' }, { id: 'asc' }],
        take: 51,
      }),
    );
  });

  it('positionId mode: verifies ownership against StakePositionV2 (404 if not owned), oldest-day-first, page size 50', async () => {
    setupAuthed();
    stakePositionV2FindFirstMock.mockResolvedValue(null);

    const res = await GET(makeReq('positionId=pos-1'));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(stakePositionV2FindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'pos-1', userId: 'user-1' } }),
    );
    expect(stakeYieldLedgerEntryFindManyMock).not.toHaveBeenCalled();
    void json;
  });

  it('positionId mode (owned): dayIndex asc, id asc', async () => {
    setupAuthed();
    stakePositionV2FindFirstMock.mockResolvedValue({ id: 'pos-1' });

    const res = await GET(makeReq('positionId=pos-1'));
    await res.json();

    expect(stakeYieldLedgerEntryFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', positionId: 'pos-1' },
        orderBy: [{ dayIndex: 'asc' }, { id: 'asc' }],
        take: 51,
      }),
    );
  });

  it('cursor + limit page through any mode, and hasMore/nextCursor/total are always returned, and settledAt (not paidAt) is the JSON field', async () => {
    setupAuthed();
    stakeYieldLedgerEntryFindManyMock.mockResolvedValue([
      { id: 'e1', coin: 'BANA', amount: '0.2', dayIndex: 1, settledAt: new Date('2026-08-02T00:00:00.000Z'), positionId: 'pos-1' },
    ]);
    stakeYieldLedgerEntryCountMock.mockResolvedValue(1);

    const res = await GET(makeReq('cursor=e0&limit=1'));
    const json = await res.json();

    expect(stakeYieldLedgerEntryFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: 'e0' }, skip: 1, take: 2 }),
    );
    expect(json.data.hasMore).toBe(false);
    expect(json.data.nextCursor).toBeNull();
    expect(json.data.total).toBe(1);
    expect(json.data.payouts[0]).toMatchObject({ id: 'e1', settledAt: '2026-08-02T00:00:00.000Z' });
    expect(json.data.payouts[0].paidAt).toBeUndefined();
  });
});
