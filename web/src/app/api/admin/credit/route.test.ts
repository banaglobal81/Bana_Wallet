// T-17 regression coverage — POST /api/admin/credit.
// rev05 §4A / rev05a (AC-15/AC-16/AC-17/AC-13′) — every safeguard this route is
// responsible for wiring (as opposed to the pure decision logic already covered by
// src/lib/localLedger.test.ts). `evaluateAdminAdjustmentGate`/`isAdminAdjustmentBlocked`/
// `LocalLedgerIdempotencyConflictError` are kept as the REAL implementations
// (importOriginal) — only the DB-touching functions are mocked — so this suite
// exercises the actual route -> gate-function wiring, not a re-description of it.
import { afterEach, describe, expect, it, vi } from 'vitest';

const requireAdminMock = vi.fn();
vi.mock('@/lib/auth/session', () => ({ requireAdmin: (...args: unknown[]) => requireAdminMock(...args) }));

const creditLocalLedgerMock = vi.fn();
const debitLocalLedgerMock = vi.fn();
const lockManagedCoinForAdminAdjustmentMock = vi.fn();
const getUserCoinBalanceMock = vi.fn();
const getCoinAdminAdjustmentNetMock = vi.fn();
const getLocalLedgerBalanceTotalMock = vi.fn();

vi.mock('@/lib/localLedger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/localLedger')>();
  return {
    ...actual,
    creditLocalLedger: (...args: unknown[]) => creditLocalLedgerMock(...args),
    debitLocalLedger: (...args: unknown[]) => debitLocalLedgerMock(...args),
    lockManagedCoinForAdminAdjustment: (...args: unknown[]) => lockManagedCoinForAdminAdjustmentMock(...args),
    getUserCoinBalance: (...args: unknown[]) => getUserCoinBalanceMock(...args),
    getCoinAdminAdjustmentNet: (...args: unknown[]) => getCoinAdminAdjustmentNetMock(...args),
    getLocalLedgerBalanceTotal: (...args: unknown[]) => getLocalLedgerBalanceTotalMock(...args),
  };
});

const getPlatformSettingsMock = vi.fn();
const findAdminCreditTargetUserMock = vi.fn();
const computeAdminCreditLimitRowsMock = vi.fn();

vi.mock('@/lib/adminCredit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/adminCredit')>();
  return {
    ...actual,
    getPlatformSettings: (...args: unknown[]) => getPlatformSettingsMock(...args),
    findAdminCreditTargetUser: (...args: unknown[]) => findAdminCreditTargetUserMock(...args),
    computeAdminCreditLimitRows: (...args: unknown[]) => computeAdminCreditLimitRowsMock(...args),
  };
});

const localLedgerEntryFindUniqueMock = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ localLedgerEntry: { findUnique: (...args: unknown[]) => localLedgerEntryFindUniqueMock(...args) } }),
  },
}));

import { POST } from './route';

const ADMIN = { id: 'admin-1', email: 'admin@test.com' };
const TARGET_USER = { id: 'u1', email: 'user@test.com' };
const ENABLED_SETTINGS = {
  adminCreditEnabled: true,
  adminCreditMaxPerTx: '5000',
  adminCreditMaxPerDay: '20000',
  adminCreditCumulativeCap: '100000',
};

function req(body: unknown): Request {
  return { json: async () => body, headers: new Headers() } as unknown as Request;
}

function validCreditBody(overrides: Record<string, unknown> = {}) {
  return {
    direction: 'CREDIT',
    email: 'user@test.com',
    coin: 'BANA',
    amount: '100',
    reasonType: 'RECONCILIATION_FIX',
    description: 'fixing a known mismatch',
    confirmEmail: 'user@test.com',
    confirmAmount: '100',
    idempotencyKey: 'key-1',
    ...overrides,
  };
}

function okGate() {
  lockManagedCoinForAdminAdjustmentMock.mockResolvedValue({ id: 'mc-1', balanceAuthority: 'LOCAL', authorityAlertStage: 'CLEAR' });
}

function okLimits() {
  computeAdminCreditLimitRowsMock.mockResolvedValue([
    { key: 'perTx', limit: '5000', used: null, remaining: null },
    { key: 'perDay', limit: '20000', used: '0', remaining: '20000' },
    { key: 'cumulative', limit: '100000', used: '0', remaining: '100000' },
  ]);
}

function okPostWrite() {
  getUserCoinBalanceMock.mockResolvedValue({ balance: '100', held: '0', available: '100' });
  getLocalLedgerBalanceTotalMock.mockResolvedValue('1000');
  getCoinAdminAdjustmentNetMock.mockResolvedValue('100');
}

describe('POST /api/admin/credit', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('403s (before any DB work) when the caller is not an admin', async () => {
    requireAdminMock.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    const res = await POST(req(validCreditBody()));
    expect(res.status).toBe(403);
    expect(getPlatformSettingsMock).not.toHaveBeenCalled();
  });

  it('AC-5-1 — 400s when a forbidden field (createdByAdminId) is present in the body, before touching settings', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    const res = await POST(req(validCreditBody({ createdByAdminId: 'someone-else' })));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe('ADMIN_CREDIT_FORBIDDEN_FIELD');
    expect(getPlatformSettingsMock).not.toHaveBeenCalled();
  });

  it('AC-13′ — 403 ADMIN_CREDIT_DISABLED when the kill switch is off', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    getPlatformSettingsMock.mockResolvedValue({ ...ENABLED_SETTINGS, adminCreditEnabled: false });

    const res = await POST(req(validCreditBody()));
    const json = await res.json();
    expect(res.status).toBe(403);
    expect(json.code).toBe('ADMIN_CREDIT_DISABLED');
    expect(findAdminCreditTargetUserMock).not.toHaveBeenCalled();
  });

  it('AC-3 — 400 ADMIN_CREDIT_CONFIRMATION_MISMATCH when confirmAmount does not match amount', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    const res = await POST(req(validCreditBody({ confirmAmount: '999' })));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe('ADMIN_CREDIT_CONFIRMATION_MISMATCH');
  });

  it('AC-3 — accepts a differently-formatted (but Decimal-equal) confirmAmount, e.g. "100.00" for "100"', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    getPlatformSettingsMock.mockResolvedValue(ENABLED_SETTINGS);
    findAdminCreditTargetUserMock.mockResolvedValue(TARGET_USER);
    localLedgerEntryFindUniqueMock.mockResolvedValue(null);
    okGate();
    okLimits();
    creditLocalLedgerMock.mockResolvedValue({ id: 'entry-1', balanceAfter: '100' });
    okPostWrite();

    const res = await POST(req(validCreditBody({ confirmAmount: '100.00' })));
    expect(res.status).toBe(200);
  });

  it('AC-12 — 400 ADMIN_CREDIT_USER_NOT_FOUND when the target email does not resolve, without ever locking the coin', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    getPlatformSettingsMock.mockResolvedValue(ENABLED_SETTINGS);
    findAdminCreditTargetUserMock.mockResolvedValue(null);

    const res = await POST(req(validCreditBody()));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe('ADMIN_CREDIT_USER_NOT_FOUND');
    expect(lockManagedCoinForAdminAdjustmentMock).not.toHaveBeenCalled();
  });

  it('AC-15 — 400 ADMIN_CREDIT_COIN_NOT_LOCAL when the coin is HUB-authority, and never writes a ledger entry', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    getPlatformSettingsMock.mockResolvedValue(ENABLED_SETTINGS);
    findAdminCreditTargetUserMock.mockResolvedValue(TARGET_USER);
    localLedgerEntryFindUniqueMock.mockResolvedValue(null);
    lockManagedCoinForAdminAdjustmentMock.mockResolvedValue({ id: 'mc-1', balanceAuthority: 'HUB', authorityAlertStage: 'CLEAR' });

    const res = await POST(req(validCreditBody()));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe('ADMIN_CREDIT_COIN_NOT_LOCAL');
    expect(creditLocalLedgerMock).not.toHaveBeenCalled();
  });

  it('AC-15 — also rejects DEBIT on a HUB-authority coin (both directions restricted)', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    getPlatformSettingsMock.mockResolvedValue(ENABLED_SETTINGS);
    findAdminCreditTargetUserMock.mockResolvedValue(TARGET_USER);
    localLedgerEntryFindUniqueMock.mockResolvedValue(null);
    lockManagedCoinForAdminAdjustmentMock.mockResolvedValue({ id: 'mc-1', balanceAuthority: 'HUB', authorityAlertStage: 'CLEAR' });

    const res = await POST(req(validCreditBody({ direction: 'DEBIT' })));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe('ADMIN_CREDIT_COIN_NOT_LOCAL');
    expect(debitLocalLedgerMock).not.toHaveBeenCalled();
  });

  it('AC-16 — 400 ADMIN_CREDIT_T2_REASON_RESTRICTED for a T2_HALTED coin credited with a non-reconciliation reason', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    getPlatformSettingsMock.mockResolvedValue(ENABLED_SETTINGS);
    findAdminCreditTargetUserMock.mockResolvedValue(TARGET_USER);
    localLedgerEntryFindUniqueMock.mockResolvedValue(null);
    lockManagedCoinForAdminAdjustmentMock.mockResolvedValue({ id: 'mc-1', balanceAuthority: 'LOCAL', authorityAlertStage: 'T2_HALTED' });

    const res = await POST(req(validCreditBody({ reasonType: 'E2E_VERIFICATION', description: 'trying to test on a halted coin' })));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe('ADMIN_CREDIT_T2_REASON_RESTRICTED');
    expect(creditLocalLedgerMock).not.toHaveBeenCalled();
  });

  it('AC-16 — a T2_HALTED coin credited with RECONCILIATION_FIX is allowed through to the ledger call', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    getPlatformSettingsMock.mockResolvedValue(ENABLED_SETTINGS);
    findAdminCreditTargetUserMock.mockResolvedValue(TARGET_USER);
    localLedgerEntryFindUniqueMock.mockResolvedValue(null);
    lockManagedCoinForAdminAdjustmentMock.mockResolvedValue({ id: 'mc-1', balanceAuthority: 'LOCAL', authorityAlertStage: 'T2_HALTED' });
    okLimits();
    creditLocalLedgerMock.mockResolvedValue({ id: 'entry-1', balanceAfter: '100' });
    okPostWrite();

    const res = await POST(req(validCreditBody({ reasonType: 'RECONCILIATION_FIX', description: 'resolving the T2 halt' })));
    expect(res.status).toBe(200);
    expect(creditLocalLedgerMock).toHaveBeenCalledTimes(1);
  });

  it('AC-16 — a T2_HALTED coin debited with any reason is allowed (debit is never reason-restricted)', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    getPlatformSettingsMock.mockResolvedValue(ENABLED_SETTINGS);
    findAdminCreditTargetUserMock.mockResolvedValue(TARGET_USER);
    localLedgerEntryFindUniqueMock.mockResolvedValue(null);
    lockManagedCoinForAdminAdjustmentMock.mockResolvedValue({ id: 'mc-1', balanceAuthority: 'LOCAL', authorityAlertStage: 'T2_HALTED' });
    debitLocalLedgerMock.mockResolvedValue({ id: 'entry-1', balanceAfter: '0' });
    okPostWrite();

    const res = await POST(
      req(validCreditBody({ direction: 'DEBIT', reasonType: 'E2E_VERIFICATION', description: 'recovering test funds' })),
    );
    expect(res.status).toBe(200);
    expect(debitLocalLedgerMock).toHaveBeenCalledTimes(1);
    // A DEBIT never goes through the per-tx/per-day/cumulative CREDIT caps.
    expect(computeAdminCreditLimitRowsMock).not.toHaveBeenCalled();
  });

  it('AC-6 — 400 ADMIN_CREDIT_LIMIT_PER_TX when the amount exceeds the per-transaction cap', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    getPlatformSettingsMock.mockResolvedValue(ENABLED_SETTINGS);
    findAdminCreditTargetUserMock.mockResolvedValue(TARGET_USER);
    localLedgerEntryFindUniqueMock.mockResolvedValue(null);
    okGate();
    computeAdminCreditLimitRowsMock.mockResolvedValue([
      { key: 'perTx', limit: '50', used: null, remaining: null },
      { key: 'perDay', limit: '20000', used: '0', remaining: '20000' },
      { key: 'cumulative', limit: '100000', used: '0', remaining: '100000' },
    ]);

    const res = await POST(req(validCreditBody({ amount: '100', confirmAmount: '100' })));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe('ADMIN_CREDIT_LIMIT_PER_TX');
    expect(creditLocalLedgerMock).not.toHaveBeenCalled();
  });

  it('AC-6 — null-configured limits are fail-closed, not unlimited (ADMIN_CREDIT_LIMIT_PER_TX)', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    getPlatformSettingsMock.mockResolvedValue(ENABLED_SETTINGS);
    findAdminCreditTargetUserMock.mockResolvedValue(TARGET_USER);
    localLedgerEntryFindUniqueMock.mockResolvedValue(null);
    okGate();
    computeAdminCreditLimitRowsMock.mockResolvedValue([
      { key: 'perTx', limit: null, used: null, remaining: null },
      { key: 'perDay', limit: '20000', used: '0', remaining: '20000' },
      { key: 'cumulative', limit: '100000', used: '0', remaining: '100000' },
    ]);

    const res = await POST(req(validCreditBody()));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe('ADMIN_CREDIT_LIMIT_PER_TX');
  });

  it('AC-6 — 400 ADMIN_CREDIT_CUMULATIVE_CAP when the net-credit cap would be exceeded', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    getPlatformSettingsMock.mockResolvedValue(ENABLED_SETTINGS);
    findAdminCreditTargetUserMock.mockResolvedValue(TARGET_USER);
    localLedgerEntryFindUniqueMock.mockResolvedValue(null);
    okGate();
    computeAdminCreditLimitRowsMock.mockResolvedValue([
      { key: 'perTx', limit: '5000', used: null, remaining: null },
      { key: 'perDay', limit: '20000', used: '0', remaining: '20000' },
      { key: 'cumulative', limit: '100000', used: '99950', remaining: '50' },
    ]);

    const res = await POST(req(validCreditBody({ amount: '100', confirmAmount: '100' })));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe('ADMIN_CREDIT_CUMULATIVE_CAP');
  });

  it('AC-17/DC-6 — an existing idempotency key skips limit computation entirely and delegates to creditLocalLedger', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    getPlatformSettingsMock.mockResolvedValue(ENABLED_SETTINGS);
    findAdminCreditTargetUserMock.mockResolvedValue(TARGET_USER);
    localLedgerEntryFindUniqueMock.mockResolvedValue({ id: 'entry-1' }); // peek: key already used
    creditLocalLedgerMock.mockResolvedValue({ id: 'entry-1', balanceAfter: '100', idempotentReplay: true });
    okPostWrite();

    const res = await POST(req(validCreditBody()));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.idempotentReplay).toBe(true);
    // Neither the coin-authority gate nor the limit computation reran on a replay.
    expect(lockManagedCoinForAdminAdjustmentMock).toHaveBeenCalledTimes(1); // AC-7 lock is always taken
    expect(computeAdminCreditLimitRowsMock).not.toHaveBeenCalled();
  });

  it('AC-17 — a genuine conflict (mismatched params under the same key) maps to 409 ADMIN_CREDIT_IDEMPOTENCY_CONFLICT', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    getPlatformSettingsMock.mockResolvedValue(ENABLED_SETTINGS);
    findAdminCreditTargetUserMock.mockResolvedValue(TARGET_USER);
    localLedgerEntryFindUniqueMock.mockResolvedValue(null);
    okGate();
    okLimits();
    const { LocalLedgerIdempotencyConflictError } = await import('@/lib/localLedger');
    creditLocalLedgerMock.mockRejectedValue(
      new LocalLedgerIdempotencyConflictError({ coin: 'BANA', idempotencyKey: 'key-1', existingEntryId: 'entry-1' }),
    );

    const res = await POST(req(validCreditBody()));
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.code).toBe('ADMIN_CREDIT_IDEMPOTENCY_CONFLICT');
  });

  it('AC-11/N-48 — a DEBIT that exceeds available maps to 400 ADMIN_ADJUSTMENT_DEBIT_EXCEEDS_AVAILABLE with balance/held/available detail', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    getPlatformSettingsMock.mockResolvedValue(ENABLED_SETTINGS);
    findAdminCreditTargetUserMock.mockResolvedValue(TARGET_USER);
    localLedgerEntryFindUniqueMock.mockResolvedValue(null);
    okGate();
    debitLocalLedgerMock.mockRejectedValue(
      Object.assign(new Error('insufficient available'), {
        code: 'INSUFFICIENT_AVAILABLE_BALANCE',
        detail: { balance: '100', held: '100', available: '0' },
      }),
    );

    const res = await POST(req(validCreditBody({ direction: 'DEBIT', amount: '50', confirmAmount: '50' })));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe('ADMIN_ADJUSTMENT_DEBIT_EXCEEDS_AVAILABLE');
    expect(json.detail).toEqual({ balance: '100', held: '100', available: '0' });
  });

  it('happy path — CREDIT within all limits returns 200 with the DC-7 response shape', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    getPlatformSettingsMock.mockResolvedValue(ENABLED_SETTINGS);
    findAdminCreditTargetUserMock.mockResolvedValue(TARGET_USER);
    localLedgerEntryFindUniqueMock.mockResolvedValue(null);
    okGate();
    okLimits();
    creditLocalLedgerMock.mockResolvedValue({ id: 'entry-1', balanceAfter: '100', auditLogId: 'audit-1' });
    okPostWrite();

    const res = await POST(req(validCreditBody()));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toMatchObject({
      entryId: 'entry-1',
      direction: 'CREDIT',
      coin: 'BANA',
      amount: '100',
      userEmail: 'user@test.com',
      balanceAfter: '100',
      availableAfter: '100',
      localLedgerBalanceTotalAfter: '1000',
      adminAdjustmentNetCreditTotalAfter: '100',
      auditLogId: 'audit-1',
      idempotentReplay: false,
    });
    // AC-5-1 — the route derives identity from the session, never the body.
    expect(creditLocalLedgerMock).toHaveBeenCalledWith(
      expect.objectContaining({ createdByAdminId: 'admin-1', createdByEmail: 'admin@test.com', userId: 'u1' }),
    );
  });

  it('AC-4/DC-4 — 400 when description is shorter than the reason type\'s minimum, and never reaches the DB', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    getPlatformSettingsMock.mockResolvedValue(ENABLED_SETTINGS);

    const res = await POST(req(validCreditBody({ reasonType: 'OTHER', description: 'short' })));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe('ADMIN_CREDIT_DESCRIPTION_TOO_SHORT');
    expect(findAdminCreditTargetUserMock).not.toHaveBeenCalled();
  });
});
