// A-6 (V2-CORE) adapter boundary regression suite —
// docs/specs/staking-yield-system-v2-design-a6-deepcore-adapter.md §3.2 AC-A6-2.
//
// These 6 tests (G-1..G-6) exist because the 19 pure-module tests in
// deepCoreProgressMath.test.ts CANNOT catch an adapter-boundary regression —
// they call `deriveDeepCoreState` directly and never touch Prisma, the dayMs
// source, or the platform-flag mapping. This file exercises `getDeepCoreState`
// (the I/O wrapper) end-to-end against mocked Prisma so a flag-mapping or
// dayMs-source regression fails loudly here even though the pure tests stay
// green (A-6 §3.1 — that gap is the whole reason this file exists).
//
// `deepCoreProgressMath.ts` itself is not modified by A-6 and is not modified
// by this file — see deepCoreProgressMath.test.ts for its 19 tests (AC-A6-1).
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

const findManyPositions = vi.fn();
const findManyLedger = vi.fn();
const getPlatformSettingsMock = vi.fn();
const stakingDayMsMock = vi.fn(() => 86_400_000);

// AD-8 / G-6 — the mock Prisma client below exposes ONLY `findMany` on each
// v2 model. If the adapter ever called `.update` / `.create` / `.upsert` /
// `.delete` on either model, the call would throw (not a function) and the
// affected test would fail — that failure mode IS the "zero game-only
// writes" assertion, not just a convenience.
vi.mock('@/lib/db', () => ({
  prisma: {
    stakePositionV2: { findMany: (arg: unknown) => findManyPositions(arg) },
    stakeYieldLedgerEntry: { findMany: (arg: unknown) => findManyLedger(arg) },
  },
}));
vi.mock('@/lib/platformSettings', () => ({
  getPlatformSettings: () => getPlatformSettingsMock(),
}));
vi.mock('@/lib/stakingMath', () => ({
  stakingDayMs: () => stakingDayMsMock(),
}));
// Spy on the real deriveDeepCoreState (not a stub) so G-1/G-2/G-4/G-5 still
// exercise the actual derivation logic; G-3 additionally inspects the exact
// `dayMs` argument the adapter passed in.
vi.mock('@/lib/deepCoreProgressMath', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./deepCoreProgressMath')>();
  return { ...actual, deriveDeepCoreState: vi.fn(actual.deriveDeepCoreState) };
});

import { getDeepCoreState } from './deepCoreProgress';
import {
  deriveDeepCoreState, charterCompleteXp, type PositionRow, type DeepCorePayoutRow,
} from '@/lib/deepCoreProgressMath';

const DAY_MS = 86_400_000;
const FIXED_NOW = new Date('2026-08-10T00:00:00.000Z');

function v2Position(overrides: Partial<PositionRow> & { id: string }): PositionRow {
  return {
    status: 'ACTIVE',
    startAt: new Date(0),
    maturityAt: new Date(30 * DAY_MS),
    termDays: 30,
    daysPaid: 0,
    coin: 'BANA',
    principal: '100',
    renewedFromPositionId: null,
    product: { minAmount: '10' },
    ...overrides,
  };
}

type SettingsOverrides = Partial<{
  maintenanceMode: boolean;
  stakingWorkerEnabled: boolean; // legacy flag — the adapter must never read this
  stakingV2WorkerEnabled: boolean;
}>;

function platformSettings(overrides: SettingsOverrides = {}) {
  return {
    id: 'singleton',
    maintenanceMode: false,
    stakingWorkerEnabled: true,
    stakingV2WorkerEnabled: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  stakingDayMsMock.mockReturnValue(DAY_MS);
  getPlatformSettingsMock.mockResolvedValue(platformSettings());
  findManyPositions.mockResolvedValue([]);
  findManyLedger.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('G-1 equivalence — a v2 row set produces the same DeepCoreState an equivalent legacy row set would', () => {
  it('getDeepCoreState (v2 tables) matches deriveDeepCoreState called directly on the pre-A-6 (paidAt) shape', async () => {
    const positions = [
      v2Position({ id: 'p1', status: 'MATURED', daysPaid: 30, termDays: 30, maturityAt: new Date(20 * DAY_MS) }),
      v2Position({ id: 'p2', status: 'ACTIVE', startAt: new Date(5 * DAY_MS), maturityAt: new Date(35 * DAY_MS) }),
    ];
    const settledAt1 = new Date(1 * DAY_MS + 1000);
    const settledAt2 = new Date(2 * DAY_MS + 1000);
    findManyPositions.mockResolvedValue(positions);
    findManyLedger.mockResolvedValue([
      { positionId: 'p1', settledAt: settledAt1 },
      { positionId: 'p2', settledAt: settledAt1 },
      { positionId: 'p1', settledAt: settledAt2 },
    ]);

    const viaAdapter = await getDeepCoreState('user-1');

    const legacyPayouts: DeepCorePayoutRow[] = [
      { positionId: 'p1', paidAt: settledAt1 },
      { positionId: 'p2', paidAt: settledAt1 },
      { positionId: 'p1', paidAt: settledAt2 },
    ];
    const expected = deriveDeepCoreState(
      positions, legacyPayouts, { maintenanceMode: false, stakingWorkerEnabled: true }, new Date(), DAY_MS,
    );

    expect(viaAdapter).toEqual(expected);
    // Spell out the fields DC-2 calls out explicitly, not just deep-equal.
    expect(viaAdapter.xp).toEqual(expected.xp);
    expect(viaAdapter.svEarned).toBe(expected.svEarned);
    expect(viaAdapter.operatingDays).toBe(expected.operatingDays);
    expect(viaAdapter.wells).toEqual(expected.wells);
    expect(viaAdapter.surfaceState).toBe(expected.surfaceState);
  });
});

describe('G-2 catch-up collapse (AD-6) — N caught-up ledger rows with identical settledAt collapse to 1 operating day', () => {
  it('5 rows for 1 position, all settled at the same instant, yield operatingDays=1 and the 3-position-cap lift value', async () => {
    const positions = [v2Position({ id: 'p1' })];
    const settledAt = new Date(5 * DAY_MS + 1000); // worker was 5 days behind, caught up in one run
    findManyPositions.mockResolvedValue(positions);
    findManyLedger.mockResolvedValue(
      Array.from({ length: 5 }, () => ({ positionId: 'p1', settledAt })),
    );

    const s = await getDeepCoreState('user-1');

    expect(s.operatingDays).toBe(1);
    expect(s.xpBreakdown.lift).toBe(10); // min(1 position that day, 3) x 10 — not 5 x 10
  });
});

describe('G-3 dayMs single source (AD-4) — the adapter never uses a local copy of the day-length constant', () => {
  it('passes stakingMath.stakingDayMs()\'s value straight through to deriveDeepCoreState, unchanged', async () => {
    const distinctiveDayMs = 12_345_678; // deliberately NOT 86_400_000 — proves it's not hardcoded
    stakingDayMsMock.mockReturnValue(distinctiveDayMs);
    findManyPositions.mockResolvedValue([v2Position({ id: 'p1' })]);

    await getDeepCoreState('user-1');

    expect(deriveDeepCoreState).toHaveBeenCalledTimes(1);
    expect((deriveDeepCoreState as Mock).mock.calls[0][4]).toBe(distinctiveDayMs);
  });

  it('has no local copy of the 86,400,000 ms/day constant in the adapter source', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('./deepCoreProgress.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/86[_,]?400[_,]?000/);
  });
});

describe('G-4 flag mapping (AD-5) — S2_REPORTING_PAUSED is governed by stakingV2WorkerEnabled only', () => {
  it('stakingV2WorkerEnabled=false -> S2_REPORTING_PAUSED, even when the legacy stakingWorkerEnabled=true', async () => {
    findManyPositions.mockResolvedValue([v2Position({ id: 'p1' })]);
    getPlatformSettingsMock.mockResolvedValue(platformSettings({ stakingV2WorkerEnabled: false, stakingWorkerEnabled: true }));

    const s = await getDeepCoreState('user-1');

    expect(s.surfaceState).toBe('S2_REPORTING_PAUSED');
  });

  it('stakingV2WorkerEnabled=true -> not paused, even when the legacy stakingWorkerEnabled=false', async () => {
    findManyPositions.mockResolvedValue([v2Position({ id: 'p1' })]);
    getPlatformSettingsMock.mockResolvedValue(platformSettings({ stakingV2WorkerEnabled: true, stakingWorkerEnabled: false }));

    const s = await getDeepCoreState('user-1');

    expect(s.surfaceState).not.toBe('S2_REPORTING_PAUSED');
    expect(s.surfaceState).toBe('S1_RUNNING');
  });
});

describe('G-5 status set (AD-2/AD-3) — no PAID in the v2 enum; MATURED + daysPaid>=termDays awards charter_complete exactly once', () => {
  it('a fully-paid MATURED position awards charter_complete exactly once, reading daysPaid as-is (no re-derivation)', async () => {
    findManyPositions.mockResolvedValue([
      v2Position({ id: 'p1', status: 'MATURED', termDays: 90, daysPaid: 90 }),
    ]);

    const s = await getDeepCoreState('user-1');

    expect(s.xpBreakdown.charterComplete).toBe(charterCompleteXp(90));
    expect(s.svBreakdown.charterComplete).toBe(50);
  });

  it('a MATURED position that is underpaid (daysPaid < termDays) does not award charter_complete', async () => {
    findManyPositions.mockResolvedValue([
      v2Position({ id: 'p1', status: 'MATURED', termDays: 90, daysPaid: 10 }),
    ]);

    const s = await getDeepCoreState('user-1');

    expect(s.xpBreakdown.charterComplete).toBe(0);
  });
});

describe('G-6 zero game-only writes / minimal ledger read (AD-9)', () => {
  it('calls findMany exactly once per v2 model and nothing else', async () => {
    findManyPositions.mockResolvedValue([v2Position({ id: 'p1' })]);

    await getDeepCoreState('user-1');

    expect(findManyPositions).toHaveBeenCalledTimes(1);
    expect(findManyLedger).toHaveBeenCalledTimes(1);
  });

  it('the ledger select is exactly { positionId, settledAt } — no amount-bearing columns', async () => {
    findManyPositions.mockResolvedValue([v2Position({ id: 'p1' })]);

    await getDeepCoreState('user-1');

    const [[callArgs]] = findManyLedger.mock.calls as [[{ select: Record<string, boolean> }]];
    expect(callArgs.select).toEqual({ positionId: true, settledAt: true });
    expect(Object.keys(callArgs.select)).toHaveLength(2);
  });

  it('the position select carries no ledger amount fields either', async () => {
    findManyPositions.mockResolvedValue([v2Position({ id: 'p1' })]);

    await getDeepCoreState('user-1');

    const [[callArgs]] = findManyPositions.mock.calls as [[{ select: Record<string, unknown> }]];
    expect(callArgs.select).not.toHaveProperty('ledgeredYield');
    expect(callArgs.select).not.toHaveProperty('lastSettledAt');
    expect(callArgs.select).not.toHaveProperty('fullySettledAt');
  });
});
