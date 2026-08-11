// docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md §5.2①
// (CUT-4 / T-7) regression coverage for GET /api/staking/positions:
//   - reads StakePositionV2 (not the legacy v1 table)
//   - lazily settles matured positions BEFORE reading
//   - locked principal comes from lockedPrincipalByCoin (A-7 LB-C1), not a
//     sum of StakePositionV2.principal
//   - the DEEP CORE `game` block degrades to null on failure, never breaking
//     the real (money-adjacent) positions read (G-7 / R-5)
import { afterEach, describe, expect, it, vi } from 'vitest';

const requireUserMock = vi.fn();
vi.mock('@/lib/auth/session', () => ({ requireUser: (...args: unknown[]) => requireUserMock(...args) }));

const authMock = vi.fn();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

const settleMaturedPositionsMock = vi.fn();
const lockedPrincipalByCoinMock = vi.fn();
const serializePositionV2Mock = vi.fn();
vi.mock('@/lib/staking', () => ({
  settleMaturedPositions: (...args: unknown[]) => settleMaturedPositionsMock(...args),
  lockedPrincipalByCoin: (...args: unknown[]) => lockedPrincipalByCoinMock(...args),
  serializePositionV2: (...args: unknown[]) => serializePositionV2Mock(...args),
}));

const getDeepCoreStateMock = vi.fn();
vi.mock('@/lib/deepCoreProgress', () => ({ getDeepCoreState: (...args: unknown[]) => getDeepCoreStateMock(...args) }));

const stakePositionV2FindManyMock = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: {
    stakePositionV2: { findMany: (...args: unknown[]) => stakePositionV2FindManyMock(...args) },
  },
}));

import { GET } from './route';

describe('GET /api/staking/positions — V2 (CUT-4 / T-7)', () => {
  afterEach(() => { vi.clearAllMocks(); });

  function setupAuthed() {
    requireUserMock.mockResolvedValue(undefined);
    authMock.mockResolvedValue({ user: { id: 'db-user-1' } });
  }

  it('401s before touching the DB when unauthenticated', async () => {
    requireUserMock.mockRejectedValue(Object.assign(new Error('Unauthorized'), { status: 401 }));

    const res = await GET();

    expect(res.status).toBe(401);
    expect(settleMaturedPositionsMock).not.toHaveBeenCalled();
    expect(stakePositionV2FindManyMock).not.toHaveBeenCalled();
  });

  it('settles matured positions before reading StakePositionV2, and serializes each row via serializePositionV2', async () => {
    setupAuthed();
    settleMaturedPositionsMock.mockResolvedValue(undefined);
    stakePositionV2FindManyMock.mockResolvedValue([
      { id: 'pos-1', product: { name: '10-Day BANA' } },
    ]);
    serializePositionV2Mock.mockReturnValue({ id: 'pos-1', coin: 'BANA' });
    getDeepCoreStateMock.mockResolvedValue({ phase: 0 });
    lockedPrincipalByCoinMock.mockResolvedValue(new Map());

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(settleMaturedPositionsMock).toHaveBeenCalledWith('db-user-1');
    expect(stakePositionV2FindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'db-user-1' } }),
    );
    expect(settleMaturedPositionsMock.mock.invocationCallOrder[0])
      .toBeLessThan(stakePositionV2FindManyMock.mock.invocationCallOrder[0]);
    expect(json.data).toEqual([{ id: 'pos-1', coin: 'BANA', productName: '10-Day BANA' }]);
    expect(json.game).toEqual({ phase: 0 });
  });

  it('locked principal comes from lockedPrincipalByCoin (never a raw sum of StakePositionV2.principal)', async () => {
    setupAuthed();
    settleMaturedPositionsMock.mockResolvedValue(undefined);
    stakePositionV2FindManyMock.mockResolvedValue([]);
    serializePositionV2Mock.mockReturnValue({});
    getDeepCoreStateMock.mockResolvedValue(null);
    const { default: Decimal } = await import('decimal.js');
    lockedPrincipalByCoinMock.mockResolvedValue(new Map([['BANA', new Decimal('123.45')]]));

    const res = await GET();
    const json = await res.json();

    expect(lockedPrincipalByCoinMock).toHaveBeenCalledWith('db-user-1');
    expect(json.lockedPrincipal).toEqual({ BANA: '123.45' });
  });

  it('degrades the `game` block to null (never fails the whole response) when DEEP CORE state derivation throws', async () => {
    setupAuthed();
    settleMaturedPositionsMock.mockResolvedValue(undefined);
    stakePositionV2FindManyMock.mockResolvedValue([]);
    serializePositionV2Mock.mockReturnValue({});
    lockedPrincipalByCoinMock.mockResolvedValue(new Map());
    getDeepCoreStateMock.mockRejectedValue(new Error('boom'));

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.game).toBeNull();
  });
});
