// A-3 (V2-CORE) unit tests for src/lib/localLedger.ts.
// evaluateReserveGate is pure (no DB) — tests every ReserveGateReason branch directly,
// per rev04 PoR-G1/PoR-G2 (docs/specs/staking-yield-system-v2-design-a3-local-ledger.md §4.6).
// placeHold takes its Prisma transaction client as a plain parameter (never opens its
// own transaction — A-3 §4.3's "tx is required" contract), so it can be unit tested
// with a hand-rolled fake `tx` object with no '@/lib/db' mocking needed at all.
import { describe, it, expect, vi } from 'vitest';
import { evaluateReserveGate, isReserveGateBlocked, placeHold } from './localLedger';
import type { Prisma } from '@prisma/client';

describe('evaluateReserveGate (A-3 §4.6 / rev04 PoR-G1/PoR-G2)', () => {
  const BASE = {
    porGateEnabled: true,
    now: new Date('2026-08-10T12:00:00.000Z'),
    porGateMaxStalenessMinutes: 20,
    amount: '10',
  };

  it('passes immediately (no-op) when porGateEnabled is false, even with no run at all', () => {
    const outcome = evaluateReserveGate({ ...BASE, porGateEnabled: false, lastRun: null });
    expect(outcome).toEqual({ ok: true });
  });

  it('NO_RUN — no ReserveVerificationRun has ever been recorded for this coin', () => {
    const outcome = evaluateReserveGate({ ...BASE, lastRun: null });
    expect(isReserveGateBlocked(outcome)).toBe(true);
    if (isReserveGateBlocked(outcome)) expect(outcome.reason).toBe('NO_RUN');
  });

  it('STALE — last run older than porGateMaxStalenessMinutes', () => {
    const outcome = evaluateReserveGate({
      ...BASE,
      lastRun: { ranAt: new Date('2026-08-10T11:00:00.000Z'), result: 'PASS', marginAmount: '1000' }, // 60 min ago
    });
    expect(isReserveGateBlocked(outcome)).toBe(true);
    if (isReserveGateBlocked(outcome)) expect(outcome.reason).toBe('STALE');
  });

  it('passes when the last run is exactly within the staleness window', () => {
    const outcome = evaluateReserveGate({
      ...BASE,
      lastRun: { ranAt: new Date('2026-08-10T11:41:00.000Z'), result: 'PASS', marginAmount: '1000' }, // 19 min ago
    });
    expect(outcome).toEqual({ ok: true });
  });

  it('NO_RESERVE_BASIS — controlledAddressCount was 0 at the last run (PoR-G1)', () => {
    const outcome = evaluateReserveGate({
      ...BASE,
      lastRun: { ranAt: BASE.now, result: 'NO_RESERVE_BASIS', marginAmount: null },
    });
    expect(isReserveGateBlocked(outcome)).toBe(true);
    if (isReserveGateBlocked(outcome)) expect(outcome.reason).toBe('NO_RESERVE_BASIS');
  });

  it('INCOMPLETE — one or more left-hand components are still uncomputable', () => {
    const outcome = evaluateReserveGate({
      ...BASE,
      lastRun: { ranAt: BASE.now, result: 'INCOMPLETE', marginAmount: null },
    });
    expect(isReserveGateBlocked(outcome)).toBe(true);
    if (isReserveGateBlocked(outcome)) expect(outcome.reason).toBe('INCOMPLETE');
  });

  it('FAIL — left side exceeds the right side', () => {
    const outcome = evaluateReserveGate({
      ...BASE,
      lastRun: { ranAt: BASE.now, result: 'FAIL', marginAmount: '-5' },
    });
    expect(isReserveGateBlocked(outcome)).toBe(true);
    if (isReserveGateBlocked(outcome)) expect(outcome.reason).toBe('FAIL');
  });

  it('QUERY_FAILED — the on-chain/hub lookup itself failed (a fault, not a verdict)', () => {
    const outcome = evaluateReserveGate({
      ...BASE,
      lastRun: { ranAt: BASE.now, result: 'QUERY_FAILED', marginAmount: null },
    });
    expect(isReserveGateBlocked(outcome)).toBe(true);
    if (isReserveGateBlocked(outcome)) expect(outcome.reason).toBe('QUERY_FAILED');
  });

  it('INSUFFICIENT_MARGIN — PASS but this issuance amount exceeds the last recorded margin (PoR-G2)', () => {
    const outcome = evaluateReserveGate({
      ...BASE,
      amount: '100',
      lastRun: { ranAt: BASE.now, result: 'PASS', marginAmount: '99.999999999999999999' },
    });
    expect(isReserveGateBlocked(outcome)).toBe(true);
    if (isReserveGateBlocked(outcome)) expect(outcome.reason).toBe('INSUFFICIENT_MARGIN');
  });

  it('passes when amount is exactly equal to the margin (boundary, not strictly greater)', () => {
    const outcome = evaluateReserveGate({
      ...BASE,
      amount: '100',
      lastRun: { ranAt: BASE.now, result: 'PASS', marginAmount: '100' },
    });
    expect(outcome).toEqual({ ok: true });
  });

  it('INSUFFICIENT_MARGIN when PASS but marginAmount is unexpectedly null (defensive)', () => {
    const outcome = evaluateReserveGate({
      ...BASE,
      lastRun: { ranAt: BASE.now, result: 'PASS', marginAmount: null },
    });
    expect(isReserveGateBlocked(outcome)).toBe(true);
    if (isReserveGateBlocked(outcome)) expect(outcome.reason).toBe('INSUFFICIENT_MARGIN');
  });

  it('passes when PASS and amount is comfortably within margin', () => {
    const outcome = evaluateReserveGate({
      ...BASE,
      amount: '1',
      lastRun: { ranAt: BASE.now, result: 'PASS', marginAmount: '1000' },
    });
    expect(outcome).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// placeHold — transaction-join contract (A-3 §4.3 / A-5 §3.2 TOCTOU discussion)
// ---------------------------------------------------------------------------

function fakeTx(overrides: {
  existingBalance?: { id: string; balance: string } | null;
  activeHolds?: { amount: string }[];
}) {
  const queryRaw = vi.fn().mockResolvedValue(overrides.existingBalance ? [overrides.existingBalance] : []);
  const userCoinBalanceCreate = vi.fn().mockResolvedValue({ id: 'ucb-new', balance: '0' });
  const localBalanceHoldFindMany = vi.fn().mockResolvedValue(overrides.activeHolds ?? []);
  const localBalanceHoldCreate = vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'hold-1', ...data }));

  const tx = {
    $queryRaw: queryRaw,
    userCoinBalance: { create: userCoinBalanceCreate },
    localBalanceHold: { findMany: localBalanceHoldFindMany, create: localBalanceHoldCreate },
  } as unknown as Prisma.TransactionClient;

  return { tx, queryRaw, userCoinBalanceCreate, localBalanceHoldFindMany, localBalanceHoldCreate };
}

describe('placeHold (A-3 §4.3) — transaction join', () => {
  it('operates entirely on the caller-supplied tx — locks via tx.$queryRaw before reading holds', async () => {
    const { tx, queryRaw, localBalanceHoldFindMany, localBalanceHoldCreate } = fakeTx({
      existingBalance: { id: 'ucb-1', balance: '100' },
      activeHolds: [{ amount: '30' }],
    });

    const hold = await placeHold({
      userId: 'u1', coin: 'BANA', amount: '70', reasonCode: 'WITHDRAWAL_PENDING',
      relatedType: 'WITHDRAWAL_REQUEST', relatedId: 'wr-1', tx,
    });

    expect(hold.amount).toBe('70');
    // The FOR UPDATE lock query runs before the hold-sum read — call-order assertion.
    const lockCallOrder = queryRaw.mock.invocationCallOrder[0];
    const findManyCallOrder = localBalanceHoldFindMany.mock.invocationCallOrder[0];
    expect(lockCallOrder).toBeLessThan(findManyCallOrder);
    expect(localBalanceHoldCreate).toHaveBeenCalledTimes(1);
  });

  it('rejects when amount exceeds available (balance - active holds)', async () => {
    const { tx } = fakeTx({ existingBalance: { id: 'ucb-1', balance: '100' }, activeHolds: [{ amount: '30' }] });

    await expect(
      placeHold({
        userId: 'u1', coin: 'BANA', amount: '71', reasonCode: 'WITHDRAWAL_PENDING',
        relatedType: 'WITHDRAWAL_REQUEST', relatedId: 'wr-1', tx,
      }),
    ).rejects.toThrow(/insufficient available balance/i);
  });

  it('allows a request for exactly the available amount (boundary)', async () => {
    const { tx } = fakeTx({ existingBalance: { id: 'ucb-1', balance: '100' }, activeHolds: [{ amount: '30' }] });
    const hold = await placeHold({
      userId: 'u1', coin: 'BANA', amount: '70', reasonCode: 'WITHDRAWAL_PENDING',
      relatedType: 'WITHDRAWAL_REQUEST', relatedId: 'wr-1', tx,
    });
    expect(hold.amount).toBe('70');
  });

  it('creates a zero-balance UserCoinBalance row under the same tx when none exists yet, then rejects any positive hold', async () => {
    const { tx, userCoinBalanceCreate } = fakeTx({ existingBalance: null, activeHolds: [] });

    await expect(
      placeHold({
        userId: 'new-user', coin: 'BANA', amount: '1', reasonCode: 'WITHDRAWAL_PENDING',
        relatedType: 'WITHDRAWAL_REQUEST', relatedId: 'wr-2', tx,
      }),
    ).rejects.toThrow(/insufficient available balance/i);
    expect(userCoinBalanceCreate).toHaveBeenCalledWith({ data: { userId: 'new-user', coin: 'BANA', balance: '0' } });
  });

  it('rejects a non-positive amount before touching the tx at all', async () => {
    const { tx, queryRaw } = fakeTx({ existingBalance: { id: 'ucb-1', balance: '100' } });
    await expect(
      placeHold({
        userId: 'u1', coin: 'BANA', amount: '0', reasonCode: 'WITHDRAWAL_PENDING',
        relatedType: 'WITHDRAWAL_REQUEST', relatedId: 'wr-1', tx,
      }),
    ).rejects.toThrow(/must be a positive decimal string/i);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('places a STAKE_PRINCIPAL_LOCK hold identically to WITHDRAWAL_PENDING (same mechanism, A-3 §1 principle 2)', async () => {
    const { tx } = fakeTx({ existingBalance: { id: 'ucb-1', balance: '50' }, activeHolds: [] });
    const hold = await placeHold({
      userId: 'u1', coin: 'BANA', amount: '50', reasonCode: 'STAKE_PRINCIPAL_LOCK',
      relatedType: 'STAKE_POSITION', relatedId: 'pos-1', tx,
    });
    expect(hold.reasonCode).toBe('STAKE_PRINCIPAL_LOCK');
    expect(hold.status).toBe('ACTIVE');
  });
});
