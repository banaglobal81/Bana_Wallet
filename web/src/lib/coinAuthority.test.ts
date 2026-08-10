// A-2 (V2-CORE) unit tests for src/lib/coinAuthority.ts — changeAuthorityDirectly's
// TOCTOU protection (wallet-security-expert required fix 3,
// docs/specs/staking-yield-system-v2-design-a2-balance-authority.md §4.6).
//
// The whole point of §4.6's redesign is "lock, THEN check, THEN write — all inside
// one transaction, one function call" (no separate judge-then-write two-step API).
// These tests assert that exact call ORDER against a fake tx, and that the
// directAuthorityChangeInProgress flag is set BEFORE the balance sum is read (the
// mechanism that actually closes the race — a concurrent creditLocalLedger issuance
// call that takes the same ManagedCoin row lock first must see the coin
// mid-transition once it gets its turn).
import { describe, it, expect, vi, afterEach } from 'vitest';

const managedCoinUpdate = vi.fn();
const managedCoinFindUniqueOrThrow = vi.fn();
const queryRaw = vi.fn();
const userCoinBalanceFindMany = vi.fn();
const coinAuthorityProbeFindFirst = vi.fn();
const auditLogCreate = vi.fn();

function makeFakeTx() {
  return {
    $queryRaw: queryRaw,
    managedCoin: { update: managedCoinUpdate, findUniqueOrThrow: managedCoinFindUniqueOrThrow },
    userCoinBalance: { findMany: userCoinBalanceFindMany },
    coinAuthorityProbe: { findFirst: coinAuthorityProbeFindFirst },
    auditLog: { create: auditLogCreate },
  };
}

const transactionMock = vi.fn((cb: (tx: unknown) => unknown) => cb(makeFakeTx()));

vi.mock('@/lib/db', () => ({
  prisma: { $transaction: (cb: (tx: unknown) => unknown) => transactionMock(cb) },
}));
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('@/lib/nia/client', () => ({ niaRequest: vi.fn() }));

import { changeAuthorityDirectly, DirectAuthorityChangeUnavailableError } from './coinAuthority';

describe('changeAuthorityDirectly (A-2 §4.6) — TOCTOU protection', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('runs entirely inside a single prisma.$transaction call (no separate judge-then-write)', async () => {
    queryRaw.mockResolvedValue([
      { id: 'mc-1', symbol: 'BANA', balanceAuthority: 'LOCAL', authorityAlertStage: 'CLEAR', directAuthorityChangeInProgress: false },
    ]);
    userCoinBalanceFindMany.mockResolvedValue([]);
    coinAuthorityProbeFindFirst.mockResolvedValue(null);
    managedCoinUpdate.mockResolvedValue({});
    managedCoinFindUniqueOrThrow.mockResolvedValue({
      id: 'mc-1', symbol: 'BANA', balanceAuthority: 'HUB', authorityAlertStage: 'CLEAR', directAuthorityChangeInProgress: false,
    });

    await changeAuthorityDirectly('BANA', { adminId: 'admin-1', adminEmail: 'a@x.com' });

    expect(transactionMock).toHaveBeenCalledTimes(1);
  });

  it('acquires the row lock (SELECT ... FOR UPDATE) before setting the in-progress flag', async () => {
    queryRaw.mockResolvedValue([
      { id: 'mc-1', symbol: 'BANA', balanceAuthority: 'LOCAL', authorityAlertStage: 'CLEAR', directAuthorityChangeInProgress: false },
    ]);
    userCoinBalanceFindMany.mockResolvedValue([]);
    coinAuthorityProbeFindFirst.mockResolvedValue(null);
    managedCoinUpdate.mockResolvedValue({});
    managedCoinFindUniqueOrThrow.mockResolvedValue({
      id: 'mc-1', symbol: 'BANA', balanceAuthority: 'HUB', authorityAlertStage: 'CLEAR', directAuthorityChangeInProgress: false,
    });

    await changeAuthorityDirectly('BANA', { adminId: 'admin-1', adminEmail: 'a@x.com' });

    const lockOrder = queryRaw.mock.invocationCallOrder[0];
    const firstFlagSetOrder = managedCoinUpdate.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(firstFlagSetOrder);
  });

  it('sets directAuthorityChangeInProgress=true BEFORE reading the UserCoinBalance sum — this is the actual race-closing mechanism', async () => {
    queryRaw.mockResolvedValue([
      { id: 'mc-1', symbol: 'BANA', balanceAuthority: 'LOCAL', authorityAlertStage: 'CLEAR', directAuthorityChangeInProgress: false },
    ]);
    userCoinBalanceFindMany.mockResolvedValue([]);
    coinAuthorityProbeFindFirst.mockResolvedValue(null);
    managedCoinUpdate.mockResolvedValue({});
    managedCoinFindUniqueOrThrow.mockResolvedValue({
      id: 'mc-1', symbol: 'BANA', balanceAuthority: 'HUB', authorityAlertStage: 'CLEAR', directAuthorityChangeInProgress: false,
    });

    await changeAuthorityDirectly('BANA', { adminId: 'admin-1', adminEmail: 'a@x.com' });

    // First managedCoin.update call must be the flag-set (directAuthorityChangeInProgress: true),
    // and it must precede the balance-sum read.
    expect(managedCoinUpdate.mock.calls[0][0].data).toEqual({ directAuthorityChangeInProgress: true });
    const flagSetOrder = managedCoinUpdate.mock.invocationCallOrder[0];
    const balanceReadOrder = userCoinBalanceFindMany.mock.invocationCallOrder[0];
    expect(flagSetOrder).toBeLessThan(balanceReadOrder);
  });

  it('throws immediately (no balance read, no flag write) when directAuthorityChangeInProgress is already true under the lock', async () => {
    queryRaw.mockResolvedValue([
      { id: 'mc-1', symbol: 'BANA', balanceAuthority: 'LOCAL', authorityAlertStage: 'CLEAR', directAuthorityChangeInProgress: true },
    ]);

    await expect(changeAuthorityDirectly('BANA', { adminId: 'admin-1', adminEmail: 'a@x.com' })).rejects.toBeInstanceOf(
      DirectAuthorityChangeUnavailableError,
    );
    expect(managedCoinUpdate).not.toHaveBeenCalled();
    expect(userCoinBalanceFindMany).not.toHaveBeenCalled();
  });

  it('throws immediately when the coin is T2_HALTED under the lock (must use the 5-step transition instead)', async () => {
    queryRaw.mockResolvedValue([
      { id: 'mc-1', symbol: 'BANA', balanceAuthority: 'LOCAL', authorityAlertStage: 'T2_HALTED', directAuthorityChangeInProgress: false },
    ]);

    await expect(changeAuthorityDirectly('BANA', { adminId: 'admin-1', adminEmail: 'a@x.com' })).rejects.toBeInstanceOf(
      DirectAuthorityChangeUnavailableError,
    );
    expect(managedCoinUpdate).not.toHaveBeenCalled();
  });

  it('reverts the in-progress flag to false and returns changed:false when the balance sum is nonzero', async () => {
    queryRaw.mockResolvedValue([
      { id: 'mc-1', symbol: 'BANA', balanceAuthority: 'LOCAL', authorityAlertStage: 'CLEAR', directAuthorityChangeInProgress: false },
    ]);
    userCoinBalanceFindMany.mockResolvedValue([{ balance: '5' }]);
    coinAuthorityProbeFindFirst.mockResolvedValue(null);
    managedCoinUpdate.mockResolvedValue({});
    managedCoinFindUniqueOrThrow.mockResolvedValue({
      id: 'mc-1', symbol: 'BANA', balanceAuthority: 'LOCAL', authorityAlertStage: 'CLEAR', directAuthorityChangeInProgress: false,
    });

    const result = await changeAuthorityDirectly('BANA', { adminId: 'admin-1', adminEmail: 'a@x.com' });

    expect(result.changed).toBe(false);
    // Called twice: once to set true, once to revert to false. Never writes balanceAuthority.
    expect(managedCoinUpdate).toHaveBeenCalledTimes(2);
    expect(managedCoinUpdate.mock.calls[1][0].data).toEqual({ directAuthorityChangeInProgress: false });
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it('reverts the in-progress flag and returns changed:false when a T2_VIOLATION probe was ever recorded, even with a zero balance', async () => {
    queryRaw.mockResolvedValue([
      { id: 'mc-1', symbol: 'BANA', balanceAuthority: 'LOCAL', authorityAlertStage: 'CLEAR', directAuthorityChangeInProgress: false },
    ]);
    userCoinBalanceFindMany.mockResolvedValue([]);
    coinAuthorityProbeFindFirst.mockResolvedValue({ id: 'probe-1', result: 'T2_VIOLATION' });
    managedCoinUpdate.mockResolvedValue({});
    managedCoinFindUniqueOrThrow.mockResolvedValue({
      id: 'mc-1', symbol: 'BANA', balanceAuthority: 'LOCAL', authorityAlertStage: 'CLEAR', directAuthorityChangeInProgress: false,
    });

    const result = await changeAuthorityDirectly('BANA', { adminId: 'admin-1', adminEmail: 'a@x.com' });

    expect(result.changed).toBe(false);
  });

  it('flips balanceAuthority + writes an AuditLog row when the sum is exactly zero and no T2 history exists', async () => {
    queryRaw.mockResolvedValue([
      { id: 'mc-1', symbol: 'BANA', balanceAuthority: 'LOCAL', authorityAlertStage: 'CLEAR', directAuthorityChangeInProgress: false },
    ]);
    userCoinBalanceFindMany.mockResolvedValue([{ balance: '0' }, { balance: '0.000000000000000000' }]);
    coinAuthorityProbeFindFirst.mockResolvedValue(null);
    managedCoinUpdate.mockResolvedValue({});
    managedCoinFindUniqueOrThrow.mockResolvedValue({
      id: 'mc-1', symbol: 'BANA', balanceAuthority: 'HUB', authorityAlertStage: 'CLEAR', directAuthorityChangeInProgress: false,
    });

    const result = await changeAuthorityDirectly('BANA', { adminId: 'admin-1', adminEmail: 'a@x.com' });

    expect(result.changed).toBe(true);
    // Second update call flips balanceAuthority (toggled from LOCAL -> HUB) and clears the flag.
    expect(managedCoinUpdate.mock.calls[1][0].data).toEqual({
      balanceAuthority: 'HUB',
      directAuthorityChangeInProgress: false,
    });
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    expect(auditLogCreate.mock.calls[0][0].data.action).toBe('COIN_AUTHORITY_DIRECT_CHANGE');
  });
});
