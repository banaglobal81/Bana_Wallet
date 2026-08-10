// docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md §5.1 CUT-2 /
// T-5 — CP-6 (open a CLOSED product) + CP-10 (interest liability cap) coverage for
// PATCH/DELETE /api/admin/staking/products/[id].
//
// wallet-security-expert CUT-2 review (REJECT → fixed): CP-10 must also trigger on
// a rate-only PATCH of an already-OPEN product (not just open/capacity-raise), and
// the check+write must be serialized under a `pg_advisory_xact_lock` transaction so
// two concurrent admins opening/raising DIFFERENT products can't each pass the check
// against the other's pre-commit snapshot. Both are covered below.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdminMock = vi.fn();
vi.mock('@/lib/auth/session', () => ({ requireAdmin: (...args: unknown[]) => requireAdminMock(...args) }));

const recordAuditMock = vi.fn();
vi.mock('@/lib/audit', () => ({ recordAudit: (...args: unknown[]) => recordAuditMock(...args) }));

const getPlatformSettingsMock = vi.fn();
vi.mock('@/lib/platformSettings', () => ({ getPlatformSettings: (...args: unknown[]) => getPlatformSettingsMock(...args) }));

// vi.mock(...) factories are hoisted above regular `const` — vi.hoisted() is
// vitest's documented escape hatch for values a hoisted factory needs to close
// over (https://vitest.dev/api/vi.html#vi-hoisted).
const {
  stakingProductV2FindUniqueMock, stakingProductV2FindManyMock, stakingProductV2UpdateMock,
  stakingProductV2DeleteMock, stakePositionV2CountMock, executeRawMock, transactionMock, dbClient,
} = vi.hoisted(() => {
  const stakingProductV2FindUniqueMock = vi.fn();
  const stakingProductV2FindManyMock = vi.fn();
  const stakingProductV2UpdateMock = vi.fn();
  const stakingProductV2DeleteMock = vi.fn();
  const stakePositionV2CountMock = vi.fn();
  const executeRawMock = vi.fn().mockResolvedValue(undefined);
  const transactionMock = vi.fn();
  // The transaction client is the SAME object as the top-level `prisma` mock (both
  // route through the identical vi.fn()s) — this lets every assertion on e.g.
  // `stakingProductV2UpdateMock` keep working unchanged whether the route calls
  // `prisma.stakingProductV2.update` directly or `tx.stakingProductV2.update`
  // inside `prisma.$transaction`, while still exercising the REAL code path (the
  // route's own `prisma.$transaction(async (tx) => ...)` call), not a stub.
  const dbClient = {
    stakingProductV2: {
      findUnique: (...args: unknown[]) => stakingProductV2FindUniqueMock(...args),
      findMany: (...args: unknown[]) => stakingProductV2FindManyMock(...args),
      update: (...args: unknown[]) => stakingProductV2UpdateMock(...args),
      delete: (...args: unknown[]) => stakingProductV2DeleteMock(...args),
    },
    stakePositionV2: { count: (...args: unknown[]) => stakePositionV2CountMock(...args) },
    $executeRaw: (...args: unknown[]) => executeRawMock(...args),
  };
  return {
    stakingProductV2FindUniqueMock, stakingProductV2FindManyMock, stakingProductV2UpdateMock,
    stakingProductV2DeleteMock, stakePositionV2CountMock, executeRawMock, transactionMock, dbClient,
  };
});

vi.mock('@/lib/db', () => ({
  prisma: {
    ...dbClient,
    $transaction: (fn: (tx: typeof dbClient) => Promise<unknown>) => transactionMock(fn),
  },
}));

import { PATCH, DELETE } from './route';

const ADMIN = { id: 'admin-1', email: 'admin@test.com' };
const PARAMS = { params: Promise.resolve({ id: 'p1' }) };

function req(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

// The CP-5′ 10-day row, CLOSED (as every product starts).
const CLOSED_PRODUCT = {
  id: 'p1', coin: 'BANA', name: '10-Day BANA', termDays: 10,
  baseDailyRatePct: '0.2', maxBonusPctOfBase: '0',
  minAmount: '100', maxAmount: '3000', capacity: '30000', status: 'CLOSED',
};

// Default: $transaction just runs the callback against the shared dbClient — i.e.
// "the lock always succeeds immediately, nothing else is contending" — which is
// what every non-concurrency test in this file wants. Re-applied before EACH test
// (clearAllMocks below wipes call history but not previously-set implementations,
// so this can't be a one-time setup — it must be freshly (re)established here).
function passthroughTransaction() {
  transactionMock.mockImplementation((fn: (tx: typeof dbClient) => Promise<unknown>) => fn(dbClient));
}

describe('PATCH /api/admin/staking/products/[id]', () => {
  beforeEach(() => { passthroughTransaction(); });
  afterEach(() => { vi.clearAllMocks(); });

  it('403s before touching the DB when the caller is not an admin', async () => {
    requireAdminMock.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    const res = await PATCH(req({ name: 'x' }), PARAMS);
    expect(res.status).toBe(403);
    expect(stakingProductV2FindUniqueMock).not.toHaveBeenCalled();
  });

  it('404s when the product does not exist', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    stakingProductV2FindUniqueMock.mockResolvedValue(null);
    const res = await PATCH(req({ name: 'x' }), PARAMS);
    expect(res.status).toBe(404);
  });

  it('a rename on a CLOSED product never triggers the CP-10 liability check (no transaction opened)', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    stakingProductV2FindUniqueMock.mockResolvedValue(CLOSED_PRODUCT);
    stakingProductV2UpdateMock.mockResolvedValue({});

    const res = await PATCH(req({ name: 'Renamed' }), PARAMS);
    expect(res.status).toBe(200);
    expect(getPlatformSettingsMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
    expect(recordAuditMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'STAKING_PRODUCT_V2_UPDATE' }));
  });

  it('CP-6/CP-10 — opens a CLOSED product when every precondition passes and the cap covers it (inside the locked transaction)', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    stakingProductV2FindUniqueMock.mockResolvedValue(CLOSED_PRODUCT);
    stakingProductV2FindManyMock.mockResolvedValue([]); // no other OPEN products
    getPlatformSettingsMock.mockResolvedValue({ maxInterestLiabilityCapBana: '10000' });
    stakingProductV2UpdateMock.mockResolvedValue({});

    const res = await PATCH(req({ status: 'OPEN' }), PARAMS);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    // The advisory lock must be acquired before the read that the cap check
    // depends on, and both before the write — otherwise the lock protects nothing.
    const lockCallOrder = executeRawMock.mock.invocationCallOrder[0];
    const findManyCallOrder = stakingProductV2FindManyMock.mock.invocationCallOrder[0];
    const updateCallOrder = stakingProductV2UpdateMock.mock.invocationCallOrder[0];
    expect(lockCallOrder).toBeLessThan(findManyCallOrder);
    expect(findManyCallOrder).toBeLessThan(updateCallOrder);
    expect(stakingProductV2UpdateMock).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { status: 'OPEN' } });
    expect(recordAuditMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'STAKING_PRODUCT_V2_OPEN' }));
  });

  it('AC-C14 — rejects opening when maxInterestLiabilityCapBana is null (fail-closed), even though the projected total is tiny', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    stakingProductV2FindUniqueMock.mockResolvedValue(CLOSED_PRODUCT);
    stakingProductV2FindManyMock.mockResolvedValue([]);
    getPlatformSettingsMock.mockResolvedValue({ maxInterestLiabilityCapBana: null });

    const res = await PATCH(req({ status: 'OPEN' }), PARAMS);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe('PRODUCT_OPEN_EXCEEDS_INTEREST_LIABILITY_CAP');
    expect(stakingProductV2UpdateMock).not.toHaveBeenCalled();
  });

  it('AC-C14 — rejects opening when the projected total (this product + other OPEN products) exceeds the cap', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    stakingProductV2FindUniqueMock.mockResolvedValue(CLOSED_PRODUCT); // projected 600
    stakingProductV2FindManyMock.mockResolvedValue([
      { id: 'p2', capacity: '20000', baseDailyRatePct: '0.5', termDays: 30 }, // 3000
    ]);
    getPlatformSettingsMock.mockResolvedValue({ maxInterestLiabilityCapBana: '3000' }); // 600+3000=3600 > 3000

    const res = await PATCH(req({ status: 'OPEN' }), PARAMS);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe('PRODUCT_OPEN_EXCEEDS_INTEREST_LIABILITY_CAP');
    expect(json.params.excess).toBe('600');
    expect(stakingProductV2UpdateMock).not.toHaveBeenCalled();
  });

  it('CP-6 — refuses to open a product whose rate is still "0" (the CP-7′ 180/360-day placeholder shape)', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    stakingProductV2FindUniqueMock.mockResolvedValue({ ...CLOSED_PRODUCT, baseDailyRatePct: '0', capacity: '0' });

    const res = await PATCH(req({ status: 'OPEN' }), PARAMS);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe('STAKE_PRODUCT_OPEN_RATE_ZERO');
    expect(getPlatformSettingsMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
    expect(stakingProductV2UpdateMock).not.toHaveBeenCalled();
  });

  it('a capacity LOWER on an already-OPEN product never triggers the CP-10 check', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    stakingProductV2FindUniqueMock.mockResolvedValue({ ...CLOSED_PRODUCT, status: 'OPEN' });
    stakingProductV2UpdateMock.mockResolvedValue({});

    const res = await PATCH(req({ capacity: '10000' }), PARAMS); // lower than existing 30000
    expect(res.status).toBe(200);
    expect(getPlatformSettingsMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('a capacity RAISE on an already-OPEN product triggers the CP-10 check and can be rejected', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    stakingProductV2FindUniqueMock.mockResolvedValue({ ...CLOSED_PRODUCT, status: 'OPEN' });
    stakingProductV2FindManyMock.mockResolvedValue([]);
    getPlatformSettingsMock.mockResolvedValue({ maxInterestLiabilityCapBana: '600' }); // exactly current

    const res = await PATCH(req({ capacity: '40000' }), PARAMS); // 40000*0.002*10=800 > 600
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe('PRODUCT_OPEN_EXCEEDS_INTEREST_LIABILITY_CAP');
    expect(stakingProductV2UpdateMock).not.toHaveBeenCalled();
  });

  // --- wallet-security-expert CUT-2 review fix #1: rate-only change while OPEN ---
  it('a rate-only RAISE on an already-OPEN product triggers the CP-10 check and can be rejected', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    // capacity 30000 stays put; raising the rate alone from 0.2% to 5%/day pushes
    // this row's own liability from 600 to 15000 — capacity never changes, so the
    // old (pre-fix) trigger (openingNow || capacityRaising) would have missed this.
    stakingProductV2FindUniqueMock.mockResolvedValue({ ...CLOSED_PRODUCT, status: 'OPEN' });
    stakingProductV2FindManyMock.mockResolvedValue([]);
    getPlatformSettingsMock.mockResolvedValue({ maxInterestLiabilityCapBana: '10000' });

    const res = await PATCH(req({ baseDailyRatePct: '5' }), PARAMS); // 30000*0.05*10=15000 > 10000
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe('PRODUCT_OPEN_EXCEEDS_INTEREST_LIABILITY_CAP');
    expect(json.params.projected).toBe('15000');
    expect(stakingProductV2UpdateMock).not.toHaveBeenCalled();
  });

  it('a rate-only change on an already-OPEN product that stays under the cap succeeds', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    stakingProductV2FindUniqueMock.mockResolvedValue({ ...CLOSED_PRODUCT, status: 'OPEN' });
    stakingProductV2FindManyMock.mockResolvedValue([]);
    getPlatformSettingsMock.mockResolvedValue({ maxInterestLiabilityCapBana: '10000' });
    stakingProductV2UpdateMock.mockResolvedValue({});

    const res = await PATCH(req({ baseDailyRatePct: '0.3' }), PARAMS); // 30000*0.003*10=900 <= 10000
    expect(res.status).toBe(200);
    expect(stakingProductV2UpdateMock).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { baseDailyRatePct: '0.3' } });
  });

  it('a rate change on a still-CLOSED product never triggers the CP-10 check', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    stakingProductV2FindUniqueMock.mockResolvedValue(CLOSED_PRODUCT);
    stakingProductV2UpdateMock.mockResolvedValue({});

    const res = await PATCH(req({ baseDailyRatePct: '5' }), PARAMS);
    expect(res.status).toBe(200);
    expect(getPlatformSettingsMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('rejects a nonzero maxBonusPctOfBase edit attempt (AC-C12, V2-BAND stays out of scope)', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    stakingProductV2FindUniqueMock.mockResolvedValue(CLOSED_PRODUCT);

    const res = await PATCH(req({ maxBonusPctOfBase: '5' }), PARAMS);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe('STAKE_PRODUCT_BAND_NOT_SUPPORTED');
    expect(stakingProductV2UpdateMock).not.toHaveBeenCalled();
  });

  // --- qa-lead FAIL fix: CP-7′ (rev05 §4.5) must be route-enforced ---
  describe('CP-7′ — 180/360-day products can never open and stay locked to capacity/rate "0"', () => {
    // A 180-day row exactly as CP-5′ requires it to be created: CLOSED, rate "0", capacity "0".
    const PLACEHOLDER_180 = { ...CLOSED_PRODUCT, termDays: 180, baseDailyRatePct: '0', capacity: '0' };

    it('refuses to open a 180-day product outright, even though every CP-6 precondition (limits set, band 0) is otherwise satisfied', async () => {
      requireAdminMock.mockResolvedValue(ADMIN);
      // Simulates an admin who first raised rate/capacity off "0" via a PATCH that
      // (pre-fix) the route allowed, then tries to open — post-fix this product can
      // never legitimately reach this shape, but the OPEN gate must hold regardless
      // of the row's current values (defense in depth, not order-dependent).
      stakingProductV2FindUniqueMock.mockResolvedValue({ ...PLACEHOLDER_180, baseDailyRatePct: '1', capacity: '50000' });

      const res = await PATCH(req({ status: 'OPEN' }), PARAMS);
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.code).toBe('STAKE_PRODUCT_TERM_NOT_FIRST_TRANCHE');
      expect(getPlatformSettingsMock).not.toHaveBeenCalled(); // fails before CP-10 even runs
      expect(stakingProductV2UpdateMock).not.toHaveBeenCalled();
    });

    it('refuses to open a 360-day product at its correct "0"/"0" shape too — CP-7′ blocks the WHOLE term, not just nonzero values', async () => {
      requireAdminMock.mockResolvedValue(ADMIN);
      stakingProductV2FindUniqueMock.mockResolvedValue({ ...CLOSED_PRODUCT, termDays: 360, baseDailyRatePct: '0', capacity: '0' });

      const res = await PATCH(req({ status: 'OPEN' }), PARAMS);
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.code).toBe('STAKE_PRODUCT_TERM_NOT_FIRST_TRANCHE');
      expect(stakingProductV2UpdateMock).not.toHaveBeenCalled();
    });

    it('rejects a rate-only PATCH that would leave a 180-day product non-"0", independent of status', async () => {
      requireAdminMock.mockResolvedValue(ADMIN);
      stakingProductV2FindUniqueMock.mockResolvedValue(PLACEHOLDER_180);

      const res = await PATCH(req({ baseDailyRatePct: '0.5' }), PARAMS);
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.code).toBe('STAKE_PRODUCT_TERM_NOT_FIRST_TRANCHE');
      expect(stakingProductV2UpdateMock).not.toHaveBeenCalled();
    });

    it('rejects a capacity-only PATCH that would leave a 360-day product non-"0", independent of status', async () => {
      requireAdminMock.mockResolvedValue(ADMIN);
      stakingProductV2FindUniqueMock.mockResolvedValue({ ...CLOSED_PRODUCT, termDays: 360, baseDailyRatePct: '0', capacity: '0' });

      const res = await PATCH(req({ capacity: '100000' }), PARAMS);
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.code).toBe('STAKE_PRODUCT_TERM_NOT_FIRST_TRANCHE');
      expect(stakingProductV2UpdateMock).not.toHaveBeenCalled();
    });

    it('still allows a rename on a 180-day product (only rate/capacity/open are gated)', async () => {
      requireAdminMock.mockResolvedValue(ADMIN);
      stakingProductV2FindUniqueMock.mockResolvedValue(PLACEHOLDER_180);
      stakingProductV2UpdateMock.mockResolvedValue({});

      const res = await PATCH(req({ name: 'Renamed 180-Day' }), PARAMS);
      expect(res.status).toBe(200);
      expect(stakingProductV2UpdateMock).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { name: 'Renamed 180-Day' } });
    });

    it('never applies the CP-7′ gate to a first-tranche (10/30/90-day) product', async () => {
      requireAdminMock.mockResolvedValue(ADMIN);
      stakingProductV2FindUniqueMock.mockResolvedValue(CLOSED_PRODUCT); // termDays: 10
      stakingProductV2FindManyMock.mockResolvedValue([]);
      getPlatformSettingsMock.mockResolvedValue({ maxInterestLiabilityCapBana: '10000' });
      stakingProductV2UpdateMock.mockResolvedValue({});

      const res = await PATCH(req({ status: 'OPEN' }), PARAMS);
      expect(res.status).toBe(200);
    });
  });

  // --- wallet-security-expert CUT-2 review fix #2: concurrency serialization ---
  describe('CP-10 concurrency (simulated sequential-commit) — reviewer requirement', () => {
    it('the second of two concurrent opens on DIFFERENT products is rejected once it sees the first one\'s commit', async () => {
      requireAdminMock.mockResolvedValue(ADMIN);
      getPlatformSettingsMock.mockResolvedValue({ maxInterestLiabilityCapBana: '3000' });

      // A shared, mutable fake row store stands in for the real Postgres rows both
      // PATCH calls would read/write inside prisma's advisory-lock-serialized
      // transaction. Routing findMany/update through this store (rather than fixed
      // mockResolvedValue snapshots, as the other tests above use) is what actually
      // exercises the property under review: does the SECOND call's cap check see
      // the FIRST call's write? A stale-snapshot bug (e.g. computing `otherOpen`
      // outside the transaction, or caching it) would make p2 pass here even though
      // p1(600) + p2(3000) = 3600 exceeds the 3000 cap — this test fails if that
      // regresses, even though it can't reproduce genuine DB-level lock contention.
      const store = new Map<string, Record<string, unknown>>([
        ['p1', { id: 'p1', coin: 'BANA', name: 'P1', termDays: 10, baseDailyRatePct: '0.2', maxBonusPctOfBase: '0', minAmount: '1', maxAmount: '3000', capacity: '30000', status: 'CLOSED' }],
        ['p2', { id: 'p2', coin: 'BANA', name: 'P2', termDays: 30, baseDailyRatePct: '0.5', maxBonusPctOfBase: '0', minAmount: '1', maxAmount: '5000', capacity: '20000', status: 'CLOSED' }],
      ]);
      stakingProductV2FindUniqueMock.mockImplementation(async ({ where: { id } }: { where: { id: string } }) => store.get(id) ?? null);
      stakingProductV2FindManyMock.mockImplementation(async ({ where }: { where: { status: string; id: { not: string } } }) =>
        [...store.values()].filter((p) => p.status === where.status && p.id !== where.id.not));
      stakingProductV2UpdateMock.mockImplementation(async ({ where: { id }, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        Object.assign(store.get(id)!, data);
        return store.get(id);
      });

      const res1 = await PATCH(req({ status: 'OPEN' }), { params: Promise.resolve({ id: 'p1' }) });
      expect(res1.status).toBe(200); // p1 alone: 30000*0.002*10 = 600 <= 3000 — opens, commits.
      expect(store.get('p1')?.status).toBe('OPEN');

      const res2 = await PATCH(req({ status: 'OPEN' }), { params: Promise.resolve({ id: 'p2' }) });
      const json2 = await res2.json();
      // p1 (now committed OPEN, 600) + p2 (20000*0.005*30 = 3000) = 3600 > 3000.
      expect(res2.status).toBe(409);
      expect(json2.code).toBe('PRODUCT_OPEN_EXCEEDS_INTEREST_LIABILITY_CAP');
      expect(json2.params.excess).toBe('600');
      expect(store.get('p2')?.status).toBe('CLOSED'); // rejected — never committed.
    });
  });
});

describe('DELETE /api/admin/staking/products/[id]', () => {
  beforeEach(() => { passthroughTransaction(); });
  afterEach(() => { vi.clearAllMocks(); });

  it('403s before touching the DB when the caller is not an admin', async () => {
    requireAdminMock.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    const res = await DELETE(req({}), PARAMS);
    expect(res.status).toBe(403);
    expect(stakingProductV2DeleteMock).not.toHaveBeenCalled();
  });

  it('refuses to delete a product that has V2 positions', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    stakingProductV2FindUniqueMock.mockResolvedValue(CLOSED_PRODUCT);
    stakePositionV2CountMock.mockResolvedValue(3);

    const res = await DELETE(req({}), PARAMS);
    expect(res.status).toBe(409);
    expect(stakingProductV2DeleteMock).not.toHaveBeenCalled();
  });

  it('deletes a product with zero positions and audit-logs it', async () => {
    requireAdminMock.mockResolvedValue(ADMIN);
    stakingProductV2FindUniqueMock.mockResolvedValue(CLOSED_PRODUCT);
    stakePositionV2CountMock.mockResolvedValue(0);
    stakingProductV2DeleteMock.mockResolvedValue({});

    const res = await DELETE(req({}), PARAMS);
    expect(res.status).toBe(200);
    expect(recordAuditMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'STAKING_PRODUCT_V2_DELETE' }));
  });
});
