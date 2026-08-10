// A-4 (V2-CORE) unit tests for src/lib/stakingV2.ts — the CUT-1 dark merge
// (docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md §5.1, T-3).
//
// Coverage priorities called out by the task:
//   - CP-2/T-2 — assertExecutionAllowed(coin, 'NEW_POSITION') is actually called on
//     every new position (the exact gap rev05 P-25/§3.2 ⓑ found: the gate existed,
//     nothing called it).
//   - CP-10 — the interest-liability cap: null-cap fail-closed, and projected >
//     cap rejected.
//   - Hold creation (placeHold) on the USER_BALANCE path, and its absence on the
//     PLATFORM_GRANT path.
//   - SETTLE-1/SETTLE-2 — incremental ledger writes (never perDay × dueDays), and
//     the T2_HALTED skip-not-error behavior.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const assertExecutionAllowedMock = vi.fn();
const assertIssuanceAllowedMock = vi.fn();
const placeHoldMock = vi.fn();
const releaseHoldMock = vi.fn();
const getPlatformSettingsMock = vi.fn();

const executeRaw = vi.fn().mockResolvedValue(undefined);
const queryRaw = vi.fn().mockResolvedValue([]);
const stakingProductV2FindUnique = vi.fn();
const stakePositionV2FindManyTx = vi.fn();
const stakePositionV2FindUniqueTx = vi.fn();
const stakePositionV2Create = vi.fn();
const stakePositionV2UpdateTx = vi.fn();
const stakeYieldLedgerEntryCreateMany = vi.fn();
const userCoinYieldSummaryCreate = vi.fn();
const userCoinYieldSummaryUpdate = vi.fn();

function fakeTx() {
  return {
    $executeRaw: executeRaw,
    $queryRaw: queryRaw,
    stakingProductV2: { findUnique: stakingProductV2FindUnique },
    stakePositionV2: {
      findMany: stakePositionV2FindManyTx,
      findUnique: stakePositionV2FindUniqueTx,
      create: stakePositionV2Create,
      update: stakePositionV2UpdateTx,
    },
    stakeYieldLedgerEntry: { createMany: stakeYieldLedgerEntryCreateMany },
    userCoinYieldSummary: { create: userCoinYieldSummaryCreate, update: userCoinYieldSummaryUpdate },
  };
}

const transactionMock = vi.fn((cb: (tx: unknown) => unknown) => cb(fakeTx()));

const prismaStakePositionV2FindMany = vi.fn();
const localBalanceHoldFindMany = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: (cb: (tx: unknown) => unknown) => transactionMock(cb),
    stakePositionV2: { findMany: (...args: unknown[]) => prismaStakePositionV2FindMany(...args) },
    localBalanceHold: { findMany: (...args: unknown[]) => localBalanceHoldFindMany(...args) },
  },
}));

vi.mock('@/lib/coinAuthority', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/coinAuthority')>();
  return {
    ...actual,
    assertExecutionAllowed: (...args: unknown[]) => assertExecutionAllowedMock(...args),
    assertIssuanceAllowed: (...args: unknown[]) => assertIssuanceAllowedMock(...args),
  };
});

vi.mock('@/lib/localLedger', () => ({
  placeHold: (...args: unknown[]) => placeHoldMock(...args),
  releaseHold: (...args: unknown[]) => releaseHoldMock(...args),
}));

vi.mock('@/lib/platformSettings', () => ({
  getPlatformSettings: (...args: unknown[]) => getPlatformSettingsMock(...args),
}));

import { CoinAuthorityBlockedError } from '@/lib/coinAuthority';
import {
  createStakePositionV2,
  maturePositionV2,
  runStakingSettlementV2,
  settleMaturedPositionsV2,
  lockedPrincipalForLocal,
  projectedInterestLiability,
} from './stakingV2';

const OPEN_PRODUCT = {
  id: 'prod-10d',
  coin: 'BANA',
  name: '10-day',
  termDays: 10,
  baseDailyRatePct: '0.2',
  maxBonusPctOfBase: '0',
  minAmount: '100',
  maxAmount: '3000',
  capacity: '30000',
  status: 'OPEN',
};

beforeEach(() => {
  vi.clearAllMocks();
  executeRaw.mockResolvedValue(undefined);
  queryRaw.mockResolvedValue([]);
  assertExecutionAllowedMock.mockResolvedValue(undefined);
  assertIssuanceAllowedMock.mockResolvedValue(undefined);
  getPlatformSettingsMock.mockResolvedValue({ maxInterestLiabilityCapBana: '10000' });
  stakingProductV2FindUnique.mockResolvedValue(OPEN_PRODUCT);
  stakePositionV2FindManyTx.mockResolvedValue([]); // capacity/CP-10 existing-active lookups
  stakePositionV2Create.mockResolvedValue({ id: 'pos-1' });
  stakePositionV2UpdateTx.mockResolvedValue({});
  placeHoldMock.mockResolvedValue({ id: 'hold-1' });
});

// ---------------------------------------------------------------------------
// projectedInterestLiability — pure math (CP-10)
// ---------------------------------------------------------------------------

describe('projectedInterestLiability (CP-10 projection, pure)', () => {
  it('with no existing positions, equals the new position\'s full-term interest', () => {
    const result = projectedInterestLiability([], { principal: '1000', baseDailyRatePct: '0.5', termDays: 10 });
    // 1000 * 0.5% * 10 = 50
    expect(result.toFixed()).toBe('50');
  });

  it('sums each existing position\'s REMAINING (not full-term) interest, plus the new max', () => {
    const result = projectedInterestLiability(
      [{ principal: '1000', baseDailyRatePct: '0.2', termDays: 10, daysPaid: 4 }], // 6 days remain: 1000*0.2%*6 = 12
      { principal: '2000', baseDailyRatePct: '0.5', termDays: 30 }, // 2000*0.5%*30 = 300
    );
    expect(result.toFixed()).toBe('312');
  });

  it('clamps remaining days at 0 for an existing position with daysPaid >= termDays', () => {
    const result = projectedInterestLiability(
      [{ principal: '1000', baseDailyRatePct: '0.2', termDays: 10, daysPaid: 10 }],
      { principal: '100', baseDailyRatePct: '0.2', termDays: 10 },
    );
    // existing contributes 0; new = 100*0.2%*10 = 2
    expect(result.toFixed()).toBe('2');
  });
});

// ---------------------------------------------------------------------------
// createStakePositionV2
// ---------------------------------------------------------------------------

describe('createStakePositionV2', () => {
  const BASE_INPUT = { userId: 'u1', email: 'u1@x.com', coin: 'BANA', productId: 'prod-10d', principal: '500' };

  it('calls assertExecutionAllowed(coin, "NEW_POSITION") BEFORE opening the transaction (CP-2/T-2)', async () => {
    await createStakePositionV2(BASE_INPUT);

    expect(assertExecutionAllowedMock).toHaveBeenCalledWith('BANA', 'NEW_POSITION');
    const gateOrder = assertExecutionAllowedMock.mock.invocationCallOrder[0];
    const txOrder = transactionMock.mock.invocationCallOrder[0];
    expect(gateOrder).toBeLessThan(txOrder);
  });

  it('propagates CoinAuthorityBlockedError from the T-2 gate without opening a transaction', async () => {
    assertExecutionAllowedMock.mockRejectedValueOnce(new CoinAuthorityBlockedError('T2_HALTED', 'BANA', 'halted'));

    await expect(createStakePositionV2(BASE_INPUT)).rejects.toBeInstanceOf(CoinAuthorityBlockedError);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('rejects a non-positive principal before ever calling the T-2 gate', async () => {
    await expect(createStakePositionV2({ ...BASE_INPUT, principal: '0' })).rejects.toMatchObject({
      code: 'STAKE_INVALID_AMOUNT',
      status: 400,
    });
    expect(assertExecutionAllowedMock).not.toHaveBeenCalled();
  });

  it('STAKE_PRODUCT_NOT_FOUND when the product does not exist', async () => {
    stakingProductV2FindUnique.mockResolvedValueOnce(null);
    await expect(createStakePositionV2(BASE_INPUT)).rejects.toMatchObject({ code: 'STAKE_PRODUCT_NOT_FOUND', status: 404 });
  });

  it('STAKE_PRODUCT_CLOSED when the product is not OPEN', async () => {
    stakingProductV2FindUnique.mockResolvedValueOnce({ ...OPEN_PRODUCT, status: 'CLOSED' });
    await expect(createStakePositionV2(BASE_INPUT)).rejects.toMatchObject({ code: 'STAKE_PRODUCT_CLOSED', status: 409 });
  });

  it('STAKE_BELOW_MIN when principal is under minAmount', async () => {
    await expect(createStakePositionV2({ ...BASE_INPUT, principal: '50' })).rejects.toMatchObject({
      code: 'STAKE_BELOW_MIN',
      status: 400,
      params: { min: '100', coin: 'BANA' },
    });
  });

  it('STAKE_ABOVE_MAX when principal is over maxAmount', async () => {
    await expect(createStakePositionV2({ ...BASE_INPUT, principal: '5000' })).rejects.toMatchObject({
      code: 'STAKE_ABOVE_MAX',
      status: 400,
      params: { max: '3000', coin: 'BANA' },
    });
  });

  it('STAKE_PRODUCT_FULL when capacity would be exceeded', async () => {
    stakePositionV2FindManyTx.mockResolvedValueOnce([{ principal: '29800' }]); // capacity 30000, 200 left
    await expect(createStakePositionV2({ ...BASE_INPUT, principal: '500' })).rejects.toMatchObject({
      code: 'STAKE_PRODUCT_FULL',
      status: 409,
      params: { left: '200', coin: 'BANA' },
    });
  });

  it('STAKE_INTEREST_LIABILITY_CAP_NOT_SET (fail-closed) when the platform cap is null', async () => {
    getPlatformSettingsMock.mockResolvedValueOnce({ maxInterestLiabilityCapBana: null });
    await expect(createStakePositionV2(BASE_INPUT)).rejects.toMatchObject({
      code: 'STAKE_INTEREST_LIABILITY_CAP_NOT_SET',
      status: 409,
    });
  });

  it('STAKE_INTEREST_LIABILITY_CAP_EXCEEDED when the projected liability exceeds the cap', async () => {
    getPlatformSettingsMock.mockResolvedValueOnce({ maxInterestLiabilityCapBana: '1' });
    // 500 * 0.2% * 10 = 10, well over a cap of 1.
    await expect(createStakePositionV2(BASE_INPUT)).rejects.toMatchObject({
      code: 'STAKE_INTEREST_LIABILITY_CAP_EXCEEDED',
      status: 409,
      params: { projected: '10', cap: '1', coin: 'BANA' },
    });
  });

  it('USER_BALANCE (default): creates the position, then placeHold with relatedId=position.id, then backfills principalHoldId', async () => {
    const result = await createStakePositionV2(BASE_INPUT);

    expect(stakePositionV2Create).toHaveBeenCalledTimes(1);
    const createData = stakePositionV2Create.mock.calls[0][0].data;
    expect(createData).toMatchObject({
      userId: 'u1', email: 'u1@x.com', coin: 'BANA', principal: '500',
      baseDailyRatePct: '0.2', termDays: 10, status: 'ACTIVE', fundingSource: 'USER_BALANCE',
      grantedByAdminId: null,
    });

    expect(placeHoldMock).toHaveBeenCalledTimes(1);
    const holdArgs = placeHoldMock.mock.calls[0][0];
    expect(holdArgs).toMatchObject({
      userId: 'u1', coin: 'BANA', amount: '500', reasonCode: 'STAKE_PRINCIPAL_LOCK',
      relatedType: 'STAKE_POSITION', relatedId: 'pos-1',
    });

    // Ordering: position must be created before the hold references its id.
    const createOrder = stakePositionV2Create.mock.invocationCallOrder[0];
    const holdOrder = placeHoldMock.mock.invocationCallOrder[0];
    expect(createOrder).toBeLessThan(holdOrder);

    expect(stakePositionV2UpdateTx).toHaveBeenCalledWith({ where: { id: 'pos-1' }, data: { principalHoldId: 'hold-1' } });
    expect(result.id).toBe('pos-1');
    expect(assertIssuanceAllowedMock).not.toHaveBeenCalled(); // principal lock is not "issuance" (A-4 §9 item 1)
  });

  it('PLATFORM_GRANT: requires grantedByAdminId, calls assertIssuanceAllowed(coin) (SETTLE-3), and never calls placeHold', async () => {
    await expect(
      createStakePositionV2({ ...BASE_INPUT, fundingSource: 'PLATFORM_GRANT' }),
    ).rejects.toMatchObject({ code: 'STAKE_GRANT_MISSING_ADMIN_ID', status: 400 });
    expect(assertExecutionAllowedMock).not.toHaveBeenCalled();

    vi.clearAllMocks();
    executeRaw.mockResolvedValue(undefined);
    queryRaw.mockResolvedValue([]);
    assertExecutionAllowedMock.mockResolvedValue(undefined);
    assertIssuanceAllowedMock.mockResolvedValue(undefined);
    getPlatformSettingsMock.mockResolvedValue({ maxInterestLiabilityCapBana: '10000' });
    stakingProductV2FindUnique.mockResolvedValue(OPEN_PRODUCT);
    stakePositionV2FindManyTx.mockResolvedValue([]);
    stakePositionV2Create.mockResolvedValue({ id: 'pos-grant-1' });

    const result = await createStakePositionV2({
      ...BASE_INPUT, fundingSource: 'PLATFORM_GRANT', grantedByAdminId: 'admin-1',
    });

    expect(assertIssuanceAllowedMock).toHaveBeenCalledWith('BANA');
    expect(placeHoldMock).not.toHaveBeenCalled();
    const createData = stakePositionV2Create.mock.calls[0][0].data;
    expect(createData.fundingSource).toBe('PLATFORM_GRANT');
    expect(createData.grantedByAdminId).toBe('admin-1');
    expect(result.id).toBe('pos-grant-1');
  });
});

// ---------------------------------------------------------------------------
// maturePositionV2
// ---------------------------------------------------------------------------

describe('maturePositionV2', () => {
  it('flips ACTIVE -> MATURED and releases the hold for a fully-paid USER_BALANCE position', async () => {
    stakePositionV2FindUniqueTx.mockResolvedValueOnce({
      id: 'pos-1', status: 'ACTIVE', daysPaid: 10, termDays: 10, fundingSource: 'USER_BALANCE', principalHoldId: 'hold-1',
    });

    await maturePositionV2('pos-1', new Date('2026-08-20T00:00:00.000Z'));

    expect(stakePositionV2UpdateTx).toHaveBeenCalledWith({
      where: { id: 'pos-1' },
      data: { status: 'MATURED', fullySettledAt: new Date('2026-08-20T00:00:00.000Z') },
    });
    expect(releaseHoldMock).toHaveBeenCalledWith('hold-1', 'position matured', { tx: expect.anything() });
  });

  it('does NOT release any hold for a PLATFORM_GRANT position (none was ever created)', async () => {
    stakePositionV2FindUniqueTx.mockResolvedValueOnce({
      id: 'pos-g1', status: 'ACTIVE', daysPaid: 10, termDays: 10, fundingSource: 'PLATFORM_GRANT', principalHoldId: null,
    });

    await maturePositionV2('pos-g1');

    expect(releaseHoldMock).not.toHaveBeenCalled();
  });

  it('is idempotent: a no-op (no update, no release) if the position is already MATURED', async () => {
    stakePositionV2FindUniqueTx.mockResolvedValueOnce({
      id: 'pos-1', status: 'MATURED', daysPaid: 10, termDays: 10, fundingSource: 'USER_BALANCE', principalHoldId: 'hold-1',
    });

    await maturePositionV2('pos-1');

    expect(stakePositionV2UpdateTx).not.toHaveBeenCalled();
    expect(releaseHoldMock).not.toHaveBeenCalled();
  });

  it('throws when the position still has unpaid days (must be settled first)', async () => {
    stakePositionV2FindUniqueTx.mockResolvedValueOnce({
      id: 'pos-1', status: 'ACTIVE', daysPaid: 8, termDays: 10, fundingSource: 'USER_BALANCE', principalHoldId: 'hold-1',
    });

    await expect(maturePositionV2('pos-1')).rejects.toThrow(/unpaid days/i);
  });

  it('throws an invariant error for a USER_BALANCE position with no principalHoldId', async () => {
    stakePositionV2FindUniqueTx.mockResolvedValueOnce({
      id: 'pos-1', status: 'ACTIVE', daysPaid: 10, termDays: 10, fundingSource: 'USER_BALANCE', principalHoldId: null,
    });

    await expect(maturePositionV2('pos-1')).rejects.toThrow(/invariant violation/i);
  });
});

// ---------------------------------------------------------------------------
// runStakingSettlementV2 — SETTLE-1 (incremental) / SETTLE-2 (skip on T2_HALTED)
// ---------------------------------------------------------------------------

describe('runStakingSettlementV2', () => {
  function positionRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'pos-1', userId: 'u1', coin: 'BANA', principal: '1000', baseDailyRatePct: '0.5', termDays: 30,
      startAt: new Date('2026-07-01T00:00:00.000Z'), daysPaid: 29, ledgeredYield: '145',
      status: 'ACTIVE', fundingSource: 'USER_BALANCE', principalHoldId: 'hold-1',
      ...overrides,
    };
  }

  it('inserts exactly the newly-due days\' ledger rows and increments (never recomputes) the cache totals', async () => {
    const now = new Date('2026-07-31T00:00:00.000Z'); // dueDays=30, daysPaid=29 => 1 new day
    prismaStakePositionV2FindMany.mockResolvedValueOnce([{ id: 'pos-1' }]);
    stakePositionV2FindUniqueTx.mockResolvedValueOnce(positionRow());
    queryRaw
      .mockResolvedValueOnce(undefined) // position row lock (unused)
      .mockResolvedValueOnce([]); // no existing UserCoinYieldSummary row
    userCoinYieldSummaryCreate.mockResolvedValueOnce({ id: 'sum-1', ledgeredYieldTotal: '0', claimedYieldTotal: '0' });

    const result = await runStakingSettlementV2(now);

    expect(stakeYieldLedgerEntryCreateMany).toHaveBeenCalledTimes(1);
    const rows = stakeYieldLedgerEntryCreateMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ positionId: 'pos-1', dayIndex: 30, amount: '5', bonusAmount: '0' }); // 1000*0.5% = 5

    // ledgeredYield cache: 145 (existing) + 5 (this settlement) = 150 — an increment, not a recompute.
    const positionUpdateData = stakePositionV2UpdateTx.mock.calls[0][0].data;
    expect(positionUpdateData.ledgeredYield).toBe('150');
    expect(positionUpdateData.daysPaid).toBe(30);

    expect(userCoinYieldSummaryUpdate).toHaveBeenCalledWith({
      where: { id: 'sum-1' },
      data: { ledgeredYieldTotal: '5', version: { increment: 1 } },
    });

    // dueDays (30) >= termDays (30) => matures + releases the hold, same transaction.
    expect(releaseHoldMock).toHaveBeenCalledWith('hold-1', 'position matured', { tx: expect.anything() });

    expect(result).toMatchObject({ processed: 1, daysCredited: 1, totalLedgered: '5', matured: 1, skippedHalted: 0 });
  });

  it('skips (not errors) a position whose coin is T2_HALTED — SETTLE-2', async () => {
    const now = new Date('2026-07-31T00:00:00.000Z');
    prismaStakePositionV2FindMany.mockResolvedValueOnce([{ id: 'pos-1' }]);
    stakePositionV2FindUniqueTx.mockResolvedValueOnce(positionRow({ daysPaid: 29, termDays: 90 }));
    assertIssuanceAllowedMock.mockRejectedValueOnce(new CoinAuthorityBlockedError('T2_HALTED', 'BANA', 'halted'));

    const result = await runStakingSettlementV2(now);

    expect(stakeYieldLedgerEntryCreateMany).not.toHaveBeenCalled();
    expect(stakePositionV2UpdateTx).not.toHaveBeenCalled();
    expect(result).toMatchObject({ processed: 0, daysCredited: 0, matured: 0, skippedHalted: 1, totalLedgered: '0' });
  });

  it('does nothing (not even counted as processed) for a position with no new days due', async () => {
    const now = new Date('2026-07-15T00:00:00.000Z');
    prismaStakePositionV2FindMany.mockResolvedValueOnce([{ id: 'pos-1' }]);
    // startAt === now => daysElapsed === 0, and daysPaid is already 0 => nothing new due.
    stakePositionV2FindUniqueTx.mockResolvedValueOnce(positionRow({ startAt: now, daysPaid: 0, termDays: 30 }));

    const result = await runStakingSettlementV2(now);

    expect(stakeYieldLedgerEntryCreateMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({ processed: 0, daysCredited: 0, matured: 0, skippedHalted: 0 });
  });
});

// ---------------------------------------------------------------------------
// settleMaturedPositionsV2 — lazy read-time maturity check
// ---------------------------------------------------------------------------

describe('settleMaturedPositionsV2', () => {
  it('matures (calls the tx path for) a fully-paid past-maturity candidate', async () => {
    prismaStakePositionV2FindMany.mockResolvedValueOnce([{ id: 'pos-1', daysPaid: 10, termDays: 10 }]);
    stakePositionV2FindUniqueTx.mockResolvedValueOnce({
      id: 'pos-1', status: 'ACTIVE', daysPaid: 10, termDays: 10, fundingSource: 'USER_BALANCE', principalHoldId: 'hold-1',
    });

    await settleMaturedPositionsV2('u1');

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(releaseHoldMock).toHaveBeenCalledWith('hold-1', 'position matured', { tx: expect.anything() });
  });

  it('leaves a candidate with unpaid days untouched (never opens the maturity transaction)', async () => {
    prismaStakePositionV2FindMany.mockResolvedValueOnce([{ id: 'pos-2', daysPaid: 8, termDays: 10 }]);

    await settleMaturedPositionsV2('u1');

    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('is best-effort — swallows an error instead of throwing', async () => {
    prismaStakePositionV2FindMany.mockRejectedValueOnce(new Error('db down'));

    await expect(settleMaturedPositionsV2('u1')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// lockedPrincipalForLocal — A-7 LB-C1
// ---------------------------------------------------------------------------

describe('lockedPrincipalForLocal', () => {
  it('sums ACTIVE STAKE_PRINCIPAL_LOCK hold amounts for the given user+coin', async () => {
    localBalanceHoldFindMany.mockResolvedValueOnce([{ amount: '100' }, { amount: '250.5' }]);

    const total = await lockedPrincipalForLocal('u1', 'BANA');

    expect(total.toFixed()).toBe('350.5');
    expect(localBalanceHoldFindMany).toHaveBeenCalledWith({
      where: { userId: 'u1', coin: 'BANA', reasonCode: 'STAKE_PRINCIPAL_LOCK', status: 'ACTIVE' },
      select: { amount: true },
    });
  });

  it('returns 0 when there are no holds', async () => {
    localBalanceHoldFindMany.mockResolvedValueOnce([]);
    const total = await lockedPrincipalForLocal('u1', 'BANA');
    expect(total.toFixed()).toBe('0');
  });
});

// ---------------------------------------------------------------------------
// createStakePositionV2 — coin-level advisory lock (CP-10 cross-product race)
//
// wallet-security-expert's required fix: CP-10 sums projected interest liability
// across every ACTIVE position of a coin, but the product+user advisory locks
// alone only serialize callers targeting the SAME product. Two concurrent
// createStakePositionV2 calls for DIFFERENT products of the SAME coin were not
// serialized against each other, so both could read "not yet exceeded" and
// commit, together pushing the coin's real liability over the cap — exactly the
// scenario the current catalog is vulnerable to (3 products, theoretical max
// liability 9,900 vs the 10,000 cap, only 100 BANA headroom). This block
// simulates that race with a real per-key mutex standing in for Postgres's
// pg_advisory_xact_lock (FIFO, held for the whole transaction, released only
// once the transaction's callback settles) so the test actually exercises
// serialization, not just "was executeRaw called with the right string".
// ---------------------------------------------------------------------------

describe('createStakePositionV2 — coin-level lock serializes cross-product CP-10 races', () => {
  const defaultTransactionImpl = (cb: (tx: unknown) => unknown) => cb(fakeTx());

  afterEach(() => {
    // Restore the module-wide default so later files/tests aren't affected by
    // this block's custom $transaction simulation.
    transactionMock.mockImplementation(defaultTransactionImpl);
    stakingProductV2FindUnique.mockReset();
  });

  it('rejects the second of two concurrent same-coin, different-product stakes once their combined projected liability exceeds the cap', async () => {
    // Cap = 100. Each position alone projects 60 (within cap) — only the SUM of
    // both (120) breaches it. Without the coin lock, both transactions would
    // read the (empty) existing-active set concurrently and both would pass.
    getPlatformSettingsMock.mockResolvedValue({ maxInterestLiabilityCapBana: '100' });

    const PROD_A = { ...OPEN_PRODUCT, id: 'prod-A', baseDailyRatePct: '0.6', termDays: 10, minAmount: '1', maxAmount: '100000', capacity: null };
    const PROD_B = { ...OPEN_PRODUCT, id: 'prod-B', baseDailyRatePct: '0.6', termDays: 10, minAmount: '1', maxAmount: '100000', capacity: null };
    stakingProductV2FindUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      (where.id === 'prod-A' ? PROD_A : PROD_B),
    );

    // "Committed" rows — only mutated once a simulated transaction's callback
    // resolves and its locks are released, mirroring real commit visibility.
    const committed: Array<{ principal: string; baseDailyRatePct: string; termDays: number; daysPaid: number }> = [];
    let nextPosId = 0;

    // FIFO mutex per advisory-lock key, held until the caller releases it
    // (called from the $transaction wrapper's `finally`, i.e. at commit time).
    const queues = new Map<string, Promise<void>>();
    function acquireLock(key: string): Promise<() => void> {
      const prev = queues.get(key) ?? Promise.resolve();
      let release!: () => void;
      const held = new Promise<void>((resolve) => { release = resolve; });
      queues.set(key, prev.then(() => held));
      return prev.then(() => release);
    }

    transactionMock.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const pendingReleases: Array<() => void> = [];
      const tx = {
        $executeRaw: async (..._args: unknown[]) => {
          const key = _args[1];
          if (typeof key === 'string' && key.startsWith('stake_')) {
            pendingReleases.push(await acquireLock(key));
          }
        },
        $queryRaw: async () => [],
        stakingProductV2: { findUnique: (args: { where: { id: string } }) => stakingProductV2FindUnique(args) },
        stakePositionV2: {
          findMany: async () => committed.map((p) => ({ ...p })),
          create: async (args: { data: Record<string, unknown> }) => {
            const id = `pos-${(nextPosId += 1)}`;
            committed.push({
              principal: args.data.principal as string,
              baseDailyRatePct: args.data.baseDailyRatePct as string,
              termDays: args.data.termDays as number,
              daysPaid: 0,
            });
            return { id };
          },
          update: async () => ({}),
        },
      };
      try {
        return await (cb as (tx: unknown) => Promise<unknown>)(tx);
      } finally {
        // Advisory locks release at transaction end, same as
        // pg_advisory_xact_lock — regardless of commit or rollback.
        pendingReleases.forEach((release) => release());
      }
    });

    const inputA = { userId: 'u1', email: 'u1@x.com', coin: 'BANA', productId: 'prod-A', principal: '1000' };
    const inputB = { userId: 'u2', email: 'u2@x.com', coin: 'BANA', productId: 'prod-B', principal: '1000' };

    const results = await Promise.allSettled([createStakePositionV2(inputA), createStakePositionV2(inputB)]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

    // Exactly one of the two concurrent stakes must win; the other must be
    // rejected for the cap — never both accepted (the bug being regressed).
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: 'STAKE_INTEREST_LIABILITY_CAP_EXCEEDED' });

    // And only one position was ever actually committed — the coin's real
    // interest liability never exceeded the cap.
    expect(committed).toHaveLength(1);
  });
});
