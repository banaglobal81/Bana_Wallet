// A-3 (V2-CORE) unit tests for src/lib/localLedger.ts.
// evaluateReserveGate is pure (no DB) — tests every ReserveGateReason branch directly,
// per rev04 PoR-G1/PoR-G2 (docs/specs/staking-yield-system-v2-design-a3-local-ledger.md §4.6).
// placeHold takes its Prisma transaction client as a plain parameter (never opens its
// own transaction — A-3 §4.3's "tx is required" contract), so it can be unit tested
// with a hand-rolled fake `tx` object with no '@/lib/db' mocking needed at all.
import { describe, it, expect, vi, afterEach } from 'vitest';

// reconcileStakePrincipalHolds (INV-P5, A-3 §4.4bis) reads straight off the
// module-level `prisma` singleton (unlike placeHold/creditLocalLedger/debitLocalLedger/
// executeHold above, which always take an explicit caller-supplied `tx` and never touch
// this import) and calls recordAudit on mismatch — so it needs '@/lib/db' + '@/lib/audit'
// mocked. This is safe to add at file scope: every other function tested in this file
// is exercised exclusively through a hand-rolled fake `tx` object and never reaches the
// real `prisma` import, so replacing it here does not change their behavior.
const localBalanceHoldFindManyMock = vi.fn();
const stakePositionV2FindManyMock = vi.fn();
const recordAuditMock = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    localBalanceHold: { findMany: (...args: unknown[]) => localBalanceHoldFindManyMock(...args) },
    stakePositionV2: { findMany: (...args: unknown[]) => stakePositionV2FindManyMock(...args) },
  },
}));
vi.mock('@/lib/audit', () => ({ recordAudit: (...args: unknown[]) => recordAuditMock(...args) }));

import {
  evaluateReserveGate,
  isReserveGateBlocked,
  placeHold,
  evaluateAdminAdjustmentGate,
  isAdminAdjustmentBlocked,
  creditLocalLedger,
  debitLocalLedger,
  executeHold,
  reconcileStakePrincipalHolds,
  LocalLedgerIdempotencyConflictError,
} from './localLedger';
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

// ---------------------------------------------------------------------------
// evaluateAdminAdjustmentGate (rev05a AC-15/AC-16) — pure, no DB.
// ---------------------------------------------------------------------------

describe('evaluateAdminAdjustmentGate (rev05a §2/§3 — AC-15/AC-16)', () => {
  it('AC-15 — blocks CREDIT on a HUB-authority coin', () => {
    const outcome = evaluateAdminAdjustmentGate({
      balanceAuthority: 'HUB', authorityAlertStage: 'CLEAR', direction: 'CREDIT', reasonType: 'E2E_VERIFICATION',
    });
    expect(isAdminAdjustmentBlocked(outcome)).toBe(true);
    if (isAdminAdjustmentBlocked(outcome)) expect(outcome.reason).toBe('COIN_NOT_LOCAL');
  });

  it('AC-15 — blocks DEBIT on a HUB-authority coin too (both directions restricted, rev05a §3.3)', () => {
    const outcome = evaluateAdminAdjustmentGate({
      balanceAuthority: 'HUB', authorityAlertStage: 'CLEAR', direction: 'DEBIT', reasonType: 'RECONCILIATION_FIX',
    });
    expect(isAdminAdjustmentBlocked(outcome)).toBe(true);
    if (isAdminAdjustmentBlocked(outcome)) expect(outcome.reason).toBe('COIN_NOT_LOCAL');
  });

  it('AC-15 — blocks when there is no ManagedCoin row at all (null balanceAuthority, same "no row = HUB" contract as getCoinAuthority)', () => {
    const outcome = evaluateAdminAdjustmentGate({
      balanceAuthority: null, authorityAlertStage: null, direction: 'CREDIT', reasonType: 'E2E_VERIFICATION',
    });
    expect(isAdminAdjustmentBlocked(outcome)).toBe(true);
    if (isAdminAdjustmentBlocked(outcome)) expect(outcome.reason).toBe('COIN_NOT_LOCAL');
  });

  it('AC-16 — T2_HALTED + CREDIT + a non-RECONCILIATION_FIX reason is blocked', () => {
    for (const reasonType of ['E2E_VERIFICATION', 'INCIDENT_COMPENSATION', 'OTHER'] as const) {
      const outcome = evaluateAdminAdjustmentGate({
        balanceAuthority: 'LOCAL', authorityAlertStage: 'T2_HALTED', direction: 'CREDIT', reasonType,
      });
      expect(isAdminAdjustmentBlocked(outcome)).toBe(true);
      if (isAdminAdjustmentBlocked(outcome)) expect(outcome.reason).toBe('T2_REASON_RESTRICTED');
    }
  });

  it('AC-16 — T2_HALTED + CREDIT + RECONCILIATION_FIX is allowed (the one reason that resolves the halt)', () => {
    const outcome = evaluateAdminAdjustmentGate({
      balanceAuthority: 'LOCAL', authorityAlertStage: 'T2_HALTED', direction: 'CREDIT', reasonType: 'RECONCILIATION_FIX',
    });
    expect(outcome).toEqual({ ok: true });
  });

  it('AC-16 — T2_HALTED + DEBIT is allowed for every reason type (debit only ever shrinks the liability)', () => {
    for (const reasonType of ['E2E_VERIFICATION', 'RECONCILIATION_FIX', 'INCIDENT_COMPENSATION', 'OTHER'] as const) {
      const outcome = evaluateAdminAdjustmentGate({
        balanceAuthority: 'LOCAL', authorityAlertStage: 'T2_HALTED', direction: 'DEBIT', reasonType,
      });
      expect(outcome).toEqual({ ok: true });
    }
  });

  it('AC-16 — T1_WARNING carries no reason restriction at all, either direction', () => {
    for (const direction of ['CREDIT', 'DEBIT'] as const) {
      for (const reasonType of ['E2E_VERIFICATION', 'RECONCILIATION_FIX', 'INCIDENT_COMPENSATION', 'OTHER'] as const) {
        const outcome = evaluateAdminAdjustmentGate({
          balanceAuthority: 'LOCAL', authorityAlertStage: 'T1_WARNING', direction, reasonType,
        });
        expect(outcome).toEqual({ ok: true });
      }
    }
  });

  it('CLEAR + LOCAL is always allowed regardless of direction/reason', () => {
    const outcome = evaluateAdminAdjustmentGate({
      balanceAuthority: 'LOCAL', authorityAlertStage: 'CLEAR', direction: 'CREDIT', reasonType: 'OTHER',
    });
    expect(outcome).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// creditLocalLedger / debitLocalLedger — AC-17 idempotency replay/conflict and
// AC-11/N-48 available-balance enforcement, via a hand-rolled fake tx (same style as
// the placeHold tests above).
// ---------------------------------------------------------------------------

function fakeLedgerTx(overrides: {
  existingIdempotencyEntry?: Record<string, unknown> | null;
  existingBalance?: { id: string; balance: string } | null;
  activeHolds?: { amount: string }[];
  allBalancesForCoin?: { balance: string }[];
}) {
  const localLedgerEntryFindUnique = vi.fn().mockResolvedValue(overrides.existingIdempotencyEntry ?? null);
  const localLedgerEntryCreate = vi.fn().mockImplementation(({ data }) =>
    Promise.resolve({ id: 'entry-new', ...data }),
  );
  const queryRaw = vi.fn().mockResolvedValue(overrides.existingBalance ? [overrides.existingBalance] : []);
  const userCoinBalanceCreate = vi.fn().mockResolvedValue({ id: 'ucb-new', balance: '0' });
  const userCoinBalanceUpdate = vi.fn().mockResolvedValue({});
  const userCoinBalanceFindMany = vi.fn().mockResolvedValue(overrides.allBalancesForCoin ?? []);
  const localBalanceHoldFindMany = vi.fn().mockResolvedValue(overrides.activeHolds ?? []);
  const auditLogCreate = vi.fn().mockResolvedValue({ id: 'audit-1' });

  const tx = {
    $queryRaw: queryRaw,
    localLedgerEntry: { findUnique: localLedgerEntryFindUnique, create: localLedgerEntryCreate },
    userCoinBalance: { create: userCoinBalanceCreate, update: userCoinBalanceUpdate, findMany: userCoinBalanceFindMany },
    localBalanceHold: { findMany: localBalanceHoldFindMany },
    auditLog: { create: auditLogCreate },
  } as unknown as Prisma.TransactionClient;

  return {
    tx, localLedgerEntryFindUnique, localLedgerEntryCreate, queryRaw,
    userCoinBalanceCreate, userCoinBalanceUpdate, userCoinBalanceFindMany,
    localBalanceHoldFindMany, auditLogCreate,
  };
}

describe('creditLocalLedger/debitLocalLedger — AC-17 idempotency (rev05a §4/E-4)', () => {
  it('replays a matching key without creating a new entry or AuditLog row, and marks idempotentReplay', async () => {
    const existing = {
      id: 'entry-1', userId: 'u1', coin: 'BANA', type: 'CREDIT', reasonCode: 'ADMIN_ADJUSTMENT_CREDIT',
      amount: '100', balanceAfter: '100', idempotencyKey: 'key-1', relatedType: null, relatedId: null,
      createdByAdminId: 'admin-1', createdByEmail: 'a@x.com', adjustmentReason: 'RECONCILIATION_FIX: test',
    };
    const { tx, localLedgerEntryCreate, auditLogCreate } = fakeLedgerTx({ existingIdempotencyEntry: existing });

    const result = await creditLocalLedger({
      userId: 'u1', coin: 'BANA', amount: '100', reasonCode: 'ADMIN_ADJUSTMENT_CREDIT',
      idempotencyKey: 'key-1', createdByAdminId: 'admin-1', createdByEmail: 'a@x.com',
      adjustmentReason: 'RECONCILIATION_FIX: test', tx,
    });

    expect(result.idempotentReplay).toBe(true);
    expect(result.id).toBe('entry-1');
    expect(localLedgerEntryCreate).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it('rejects (never "succeeds") when the same key is reused with a different amount', async () => {
    const existing = {
      id: 'entry-1', userId: 'u1', coin: 'BANA', type: 'CREDIT', reasonCode: 'ADMIN_ADJUSTMENT_CREDIT',
      amount: '100', balanceAfter: '100', idempotencyKey: 'key-1', relatedType: null, relatedId: null,
      createdByAdminId: 'admin-1', createdByEmail: 'a@x.com', adjustmentReason: 'x',
    };
    const { tx } = fakeLedgerTx({ existingIdempotencyEntry: existing });

    await expect(
      creditLocalLedger({
        userId: 'u1', coin: 'BANA', amount: '250', reasonCode: 'ADMIN_ADJUSTMENT_CREDIT',
        idempotencyKey: 'key-1', createdByAdminId: 'admin-1', createdByEmail: 'a@x.com',
        adjustmentReason: 'x', tx,
      }),
    ).rejects.toBeInstanceOf(LocalLedgerIdempotencyConflictError);
  });

  it('rejects when the same key is reused with a different direction (CREDIT vs DEBIT)', async () => {
    const existing = {
      id: 'entry-1', userId: 'u1', coin: 'BANA', type: 'CREDIT', reasonCode: 'ADMIN_ADJUSTMENT_CREDIT',
      amount: '100', balanceAfter: '100', idempotencyKey: 'key-1', relatedType: null, relatedId: null,
      createdByAdminId: 'admin-1', createdByEmail: 'a@x.com', adjustmentReason: 'x',
    };
    const { tx } = fakeLedgerTx({ existingIdempotencyEntry: existing, existingBalance: { id: 'ucb-1', balance: '100' } });

    await expect(
      debitLocalLedger({
        userId: 'u1', coin: 'BANA', amount: '100', reasonCode: 'ADMIN_ADJUSTMENT_DEBIT',
        idempotencyKey: 'key-1', createdByAdminId: 'admin-1', createdByEmail: 'a@x.com',
        adjustmentReason: 'x', tx,
      }),
    ).rejects.toBeInstanceOf(LocalLedgerIdempotencyConflictError);
  });

  it('rejects when the same key is reused for a different target user', async () => {
    const existing = {
      id: 'entry-1', userId: 'u1', coin: 'BANA', type: 'CREDIT', reasonCode: 'ADMIN_ADJUSTMENT_CREDIT',
      amount: '100', balanceAfter: '100', idempotencyKey: 'key-1', relatedType: null, relatedId: null,
      createdByAdminId: 'admin-1', createdByEmail: 'a@x.com', adjustmentReason: 'x',
    };
    const { tx } = fakeLedgerTx({ existingIdempotencyEntry: existing });

    await expect(
      creditLocalLedger({
        userId: 'u2', coin: 'BANA', amount: '100', reasonCode: 'ADMIN_ADJUSTMENT_CREDIT',
        idempotencyKey: 'key-1', createdByAdminId: 'admin-1', createdByEmail: 'a@x.com',
        adjustmentReason: 'x', tx,
      }),
    ).rejects.toBeInstanceOf(LocalLedgerIdempotencyConflictError);
  });

  it('rejects when the same key is reused by a different admin', async () => {
    const existing = {
      id: 'entry-1', userId: 'u1', coin: 'BANA', type: 'CREDIT', reasonCode: 'ADMIN_ADJUSTMENT_CREDIT',
      amount: '100', balanceAfter: '100', idempotencyKey: 'key-1', relatedType: null, relatedId: null,
      createdByAdminId: 'admin-1', createdByEmail: 'a@x.com', adjustmentReason: 'x',
    };
    const { tx } = fakeLedgerTx({ existingIdempotencyEntry: existing });

    await expect(
      creditLocalLedger({
        userId: 'u1', coin: 'BANA', amount: '100', reasonCode: 'ADMIN_ADJUSTMENT_CREDIT',
        idempotencyKey: 'key-1', createdByAdminId: 'admin-2', createdByEmail: 'b@x.com',
        adjustmentReason: 'x', tx,
      }),
    ).rejects.toBeInstanceOf(LocalLedgerIdempotencyConflictError);
  });

  it('a fresh key creates a new entry and an AuditLog row, and attaches auditLogId', async () => {
    const { tx, localLedgerEntryCreate, auditLogCreate } = fakeLedgerTx({
      existingIdempotencyEntry: null,
      existingBalance: { id: 'ucb-1', balance: '0' },
      allBalancesForCoin: [{ balance: '100' }],
    });

    const result = await creditLocalLedger({
      userId: 'u1', coin: 'BANA', amount: '100', reasonCode: 'ADMIN_ADJUSTMENT_CREDIT',
      idempotencyKey: 'key-new', createdByAdminId: 'admin-1', createdByEmail: 'a@x.com',
      adjustmentReason: 'RECONCILIATION_FIX: test', tx,
    });

    expect(result.idempotentReplay).toBeUndefined();
    expect(result.auditLogId).toBe('audit-1');
    expect(localLedgerEntryCreate).toHaveBeenCalledTimes(1);
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
  });
});

describe('debitLocalLedger — AC-11/N-48 available-balance enforcement', () => {
  it('rejects a debit that exceeds `available` (balance − Σ ACTIVE holds) even though it does not exceed `balance`', async () => {
    // balance 100, an ACTIVE stake-principal hold for 100 => available 0. A naive
    // "balance only" check (the pre-N-48 behavior) would have allowed this.
    const { tx } = fakeLedgerTx({
      existingBalance: { id: 'ucb-1', balance: '100' },
      activeHolds: [{ amount: '100' }],
    });

    await expect(
      debitLocalLedger({
        userId: 'u1', coin: 'BANA', amount: '50', reasonCode: 'ADMIN_ADJUSTMENT_DEBIT',
        createdByAdminId: 'admin-1', createdByEmail: 'a@x.com', adjustmentReason: 'RECONCILIATION_FIX: recover', tx,
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_AVAILABLE_BALANCE' });
  });

  it('allows a debit for exactly the available amount (boundary)', async () => {
    const { tx } = fakeLedgerTx({
      existingBalance: { id: 'ucb-1', balance: '100' },
      activeHolds: [{ amount: '30' }],
      allBalancesForCoin: [{ balance: '70' }],
    });

    const result = await debitLocalLedger({
      userId: 'u1', coin: 'BANA', amount: '70', reasonCode: 'ADMIN_ADJUSTMENT_DEBIT',
      createdByAdminId: 'admin-1', createdByEmail: 'a@x.com', adjustmentReason: 'RECONCILIATION_FIX: recover', tx,
    });
    expect(result.balanceAfter).toBe('30');
  });

  it('a debit with no holds at all is limited only by balance (unchanged behavior)', async () => {
    const { tx } = fakeLedgerTx({ existingBalance: { id: 'ucb-1', balance: '100' }, activeHolds: [] });

    await expect(
      debitLocalLedger({
        userId: 'u1', coin: 'BANA', amount: '101', reasonCode: 'ADMIN_ADJUSTMENT_DEBIT',
        createdByAdminId: 'admin-1', createdByEmail: 'a@x.com', adjustmentReason: 'RECONCILIATION_FIX: x', tx,
      }),
    ).rejects.toThrow(/insufficient balance/i);
  });

  it('executeHold (WITHDRAWAL_EXECUTED) still succeeds for the full hold amount — NOT a regression from the new available-balance check', async () => {
    // The hold being executed is itself still ACTIVE (and therefore still counted in
    // `held`) at the moment executeHold's internal debit runs — this is exactly the
    // skipAvailableCheck case documented on mutateLocalLedger's opts. If this check
    // were NOT skipped here, balance 100 / held 100 (this same hold) would compute
    // available=0 and incorrectly reject a 100-amount debit.
    const holdRow = {
      id: 'hold-1', userId: 'u1', coin: 'BANA', amount: '100', reasonCode: 'WITHDRAWAL_PENDING',
      status: 'ACTIVE', relatedType: 'WITHDRAWAL_REQUEST', relatedId: 'wr-1', executedLedgerEntryId: null,
    };
    const localBalanceHoldFindUniqueOrThrow = vi.fn().mockResolvedValue(holdRow);
    const localBalanceHoldUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const { tx, localLedgerEntryFindUnique, localBalanceHoldFindMany } = fakeLedgerTx({
      existingBalance: { id: 'ucb-1', balance: '100' },
    });
    (tx as unknown as { localBalanceHold: Record<string, unknown> }).localBalanceHold = {
      findUniqueOrThrow: localBalanceHoldFindUniqueOrThrow,
      updateMany: localBalanceHoldUpdateMany,
      findMany: localBalanceHoldFindMany,
    };

    const { ledgerEntry } = await executeHold('hold-1', { reasonCode: 'WITHDRAWAL_EXECUTED', idempotencyKey: 'WITHDRAWAL_EXECUTED:wr-1', tx });

    expect(ledgerEntry.balanceAfter).toBe('0');
    expect(localBalanceHoldFindMany).not.toHaveBeenCalled(); // available check was skipped, as intended
    expect(localLedgerEntryFindUnique).toHaveBeenCalledTimes(1);
    expect(localBalanceHoldUpdateMany).toHaveBeenCalledWith({
      where: { id: 'hold-1', status: 'ACTIVE' },
      data: { status: 'EXECUTED', executedLedgerEntryId: 'entry-new' },
    });
  });
});

// ---------------------------------------------------------------------------
// reconcileStakePrincipalHolds (INV-P5, A-3 §4.4bis) — Σ ACTIVE STAKE_PRINCIPAL_LOCK
// holds for a coin must equal Σ principal of ACTIVE USER_BALANCE-funded StakePositionV2
// rows for that coin. This is the same cross-check runReserveVerification performs
// inline (stakeHoldMatchesPrincipal) before allowing a PASS result — a standalone
// regression suite here protects the invariant independent of the full PoR run.
// ---------------------------------------------------------------------------

describe('reconcileStakePrincipalHolds (A-3 §4.4bis / INV-P5)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('matches when Σ holds equals Σ principal exactly', async () => {
    localBalanceHoldFindManyMock.mockResolvedValue([{ amount: '100' }, { amount: '50' }]);
    stakePositionV2FindManyMock.mockResolvedValue([{ principal: '150' }]);

    const result = await reconcileStakePrincipalHolds('BANA');

    expect(result).toEqual({ holdTotal: '150', principalTotal: '150', matches: true });
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('both totals are zero (no holds, no positions) — matches, no audit', async () => {
    localBalanceHoldFindManyMock.mockResolvedValue([]);
    stakePositionV2FindManyMock.mockResolvedValue([]);

    const result = await reconcileStakePrincipalHolds('BANA');

    expect(result).toEqual({ holdTotal: '0', principalTotal: '0', matches: true });
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('reports a mismatch (does not throw) and records an audit entry with both totals', async () => {
    localBalanceHoldFindManyMock.mockResolvedValue([{ amount: '100' }]);
    stakePositionV2FindManyMock.mockResolvedValue([{ principal: '90' }]);

    const result = await reconcileStakePrincipalHolds('BANA');

    expect(result).toEqual({ holdTotal: '100', principalTotal: '90', matches: false });
    expect(recordAuditMock).toHaveBeenCalledTimes(1);
    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'STAKE_PRINCIPAL_HOLD_MISMATCH',
        targetType: 'ReserveVerificationRun',
        targetId: 'BANA',
        detail: expect.stringContaining('stakePrincipalHoldTotal=100'),
      }),
    );
    expect(recordAuditMock.mock.calls[0][0].detail).toEqual(expect.stringContaining('activeUserFundedPrincipalTotal=90'));
  });

  it('decimal.js precision: 0.1 + 0.2 sums to exactly 0.3, matching a 0.3 principal (would false-mismatch under plain float addition)', async () => {
    localBalanceHoldFindManyMock.mockResolvedValue([{ amount: '0.1' }, { amount: '0.2' }]);
    stakePositionV2FindManyMock.mockResolvedValue([{ principal: '0.3' }]);

    const result = await reconcileStakePrincipalHolds('BANA');

    expect(result.matches).toBe(true);
    expect(result.holdTotal).toBe('0.3');
  });

  it('detects a sub-cent mismatch that a naive/rounded comparison could hide', async () => {
    // decimal.js's default precision is 20 significant digits (Decimal.js docs) — this
    // difference (1e-14) is well within that window, so it must not get rounded away.
    localBalanceHoldFindManyMock.mockResolvedValue([{ amount: '100.00000000000001' }]);
    stakePositionV2FindManyMock.mockResolvedValue([{ principal: '100' }]);

    const result = await reconcileStakePrincipalHolds('BANA');

    expect(result.matches).toBe(false);
    expect(recordAuditMock).toHaveBeenCalledTimes(1);
  });

  it('queries only ACTIVE STAKE_PRINCIPAL_LOCK holds for the given coin', async () => {
    localBalanceHoldFindManyMock.mockResolvedValue([]);
    stakePositionV2FindManyMock.mockResolvedValue([]);

    await reconcileStakePrincipalHolds('BANA');

    expect(localBalanceHoldFindManyMock).toHaveBeenCalledWith({
      where: { coin: 'BANA', reasonCode: 'STAKE_PRINCIPAL_LOCK', status: 'ACTIVE' },
      select: { amount: true },
    });
  });

  it('queries only ACTIVE USER_BALANCE-funded StakePositionV2 rows for the given coin — PLATFORM_GRANT positions never inflate this side (H-2′)', async () => {
    localBalanceHoldFindManyMock.mockResolvedValue([]);
    stakePositionV2FindManyMock.mockResolvedValue([]);

    await reconcileStakePrincipalHolds('BANA');

    expect(stakePositionV2FindManyMock).toHaveBeenCalledWith({
      where: { coin: 'BANA', fundingSource: 'USER_BALANCE', status: 'ACTIVE' },
      select: { principal: true },
    });
  });

  it('scopes independently per coin — a different coin\'s holds/positions never leak in (mock call args reflect the coin argument)', async () => {
    localBalanceHoldFindManyMock.mockResolvedValue([{ amount: '5' }]);
    stakePositionV2FindManyMock.mockResolvedValue([{ principal: '5' }]);

    await reconcileStakePrincipalHolds('USDT');

    expect(localBalanceHoldFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ coin: 'USDT' }) }));
    expect(stakePositionV2FindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ coin: 'USDT' }) }));
  });
});
