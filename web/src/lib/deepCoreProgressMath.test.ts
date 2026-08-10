import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  deriveDeepCoreState, charterCompleteXp, CHARTER_OPEN_XP,
  type PositionRow, type DeepCorePayoutRow, type DeepCorePlatformFlags,
} from './deepCoreProgressMath';

const DAY_MS = 86_400_000;
const OPEN_SETTINGS: DeepCorePlatformFlags = { maintenanceMode: false, stakingWorkerEnabled: true };

function pos(overrides: Partial<PositionRow> & { id: string }): PositionRow {
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

function payout(positionId: string, dayIndex: number): DeepCorePayoutRow {
  return { positionId, paidAt: new Date(dayIndex * DAY_MS + 1000) };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('deriveDeepCoreState — S0/S5 gates', () => {
  it('S0_NOT_SHOWN when the user has no position history at all (AC-S1 precondition)', () => {
    const s = deriveDeepCoreState([], [], OPEN_SETTINGS, new Date(), DAY_MS);
    expect(s.surfaceState).toBe('S0_NOT_SHOWN');
    expect(s.xp.xpTotal).toBe(0);
  });

  it('S5_DISABLED when the global kill switch is off, even with position history', () => {
    vi.stubEnv('DEEP_CORE_ENABLED', 'false');
    const s = deriveDeepCoreState([pos({ id: 'p1' })], [], OPEN_SETTINGS, new Date(), DAY_MS);
    expect(s.surfaceState).toBe('S5_DISABLED');
  });
});

describe('deriveDeepCoreState — surface state precedence (05 §4.1/§4.2)', () => {
  const active = [pos({ id: 'p1', status: 'ACTIVE' })];

  it('S3_MAINTENANCE wins over everything else', () => {
    const s = deriveDeepCoreState(active, [], { maintenanceMode: true, stakingWorkerEnabled: false }, new Date(), DAY_MS);
    expect(s.surfaceState).toBe('S3_MAINTENANCE');
  });

  it('S2_REPORTING_PAUSED when the settlement worker is off', () => {
    const s = deriveDeepCoreState(active, [], { maintenanceMode: false, stakingWorkerEnabled: false }, new Date(), DAY_MS);
    expect(s.surfaceState).toBe('S2_REPORTING_PAUSED');
  });

  it('S4_IDLE_RIG when there are zero ACTIVE positions', () => {
    const matured = [pos({ id: 'p1', status: 'MATURED', daysPaid: 30, maturityAt: new Date(-1) })];
    const s = deriveDeepCoreState(matured, [], OPEN_SETTINGS, new Date(), DAY_MS);
    expect(s.surfaceState).toBe('S4_IDLE_RIG');
  });

  it('S1_RUNNING otherwise', () => {
    const s = deriveDeepCoreState(active, [], OPEN_SETTINGS, new Date(), DAY_MS);
    expect(s.surfaceState).toBe('S1_RUNNING');
  });
});

describe('xp.lift — AC-P1/AC-P2 (only paid days count, capped at 3 positions/day)', () => {
  it('awards 0 XP with no payout rows (P-1 — no client-reported XP, only paid rows)', () => {
    const s = deriveDeepCoreState([pos({ id: 'p1' })], [], OPEN_SETTINGS, new Date(), DAY_MS);
    expect(s.xpBreakdown.lift).toBe(0);
  });

  it('caps at 3 positions worth (30 XP) per settlement day even with 5 concurrent positions paid that day', () => {
    const positions = Array.from({ length: 5 }, (_, i) => pos({ id: `p${i}` }));
    const payouts = positions.map((p) => payout(p.id, 5));
    const s = deriveDeepCoreState(positions, payouts, OPEN_SETTINGS, new Date(), DAY_MS);
    expect(s.xpBreakdown.lift).toBe(30);
    expect(s.operatingDays).toBe(1);
  });

  it('sums across distinct settlement days, each independently capped', () => {
    const positions = [pos({ id: 'p1' }), pos({ id: 'p2' })];
    const payouts = [payout('p1', 1), payout('p2', 1), payout('p1', 2), payout('p2', 2)];
    const s = deriveDeepCoreState(positions, payouts, OPEN_SETTINGS, new Date(), DAY_MS);
    expect(s.xpBreakdown.lift).toBe(40); // 2 days × 2 positions × 10
    expect(s.operatingDays).toBe(2);
  });
});

describe('xp.charter_open — M-1 guard (docs/specs/deep-core-00-overview-and-gate.md §6.3)', () => {
  it('AC-P11 — opening N positions on the same settlement day awards at most 40 XP total, not 40×N', () => {
    const positions = [
      pos({ id: 'p1', startAt: new Date(100), maturityAt: new Date(100 + 30 * DAY_MS) }),
      pos({ id: 'p2', startAt: new Date(200), maturityAt: new Date(200 + 30 * DAY_MS) }),
      pos({ id: 'p3', startAt: new Date(300), maturityAt: new Date(300 + 30 * DAY_MS) }),
    ];
    const s = deriveDeepCoreState(positions, [], OPEN_SETTINGS, new Date(), DAY_MS);
    expect(s.xpBreakdown.charterOpen).toBe(CHARTER_OPEN_XP);
  });

  it('AC-D11 analogue — a position on a product with minAmount = null never earns charter_open XP', () => {
    const positions = [pos({ id: 'p1', product: { minAmount: null } })];
    const s = deriveDeepCoreState(positions, [], OPEN_SETTINGS, new Date(), DAY_MS);
    expect(s.xpBreakdown.charterOpen).toBe(0);
  });

  it('AC-P9 — an auto-renew successor position (renewedFromPositionId set) never earns charter_open XP', () => {
    const positions = [pos({ id: 'p1', renewedFromPositionId: 'predecessor-id' })];
    const s = deriveDeepCoreState(positions, [], OPEN_SETTINGS, new Date(), DAY_MS);
    expect(s.xpBreakdown.charterOpen).toBe(0);
  });

  it('the 4th+ concurrently-active position at open time earns 0 charter_open XP (shares lift\'s 3-position cap)', () => {
    // 4 positions, all opened on distinct days but all overlapping (still ACTIVE) the whole time —
    // so by the time p4 opens, 4 are concurrently active.
    const term = 100 * DAY_MS;
    const positions = [
      pos({ id: 'p1', startAt: new Date(0 * DAY_MS), maturityAt: new Date(0 * DAY_MS + term) }),
      pos({ id: 'p2', startAt: new Date(1 * DAY_MS), maturityAt: new Date(1 * DAY_MS + term) }),
      pos({ id: 'p3', startAt: new Date(2 * DAY_MS), maturityAt: new Date(2 * DAY_MS + term) }),
      pos({ id: 'p4', startAt: new Date(3 * DAY_MS), maturityAt: new Date(3 * DAY_MS + term) }),
    ];
    const s = deriveDeepCoreState(positions, [], OPEN_SETTINGS, new Date(), DAY_MS);
    // p1..p3 open on 3 distinct days (each counts, none exceed the cap when they open);
    // p4 opens as the 4th concurrently-active position -> excluded. So 3 distinct
    // charter_open days -> 3 × 40, not 4 × 40.
    expect(s.xpBreakdown.charterOpen).toBe(3 * CHARTER_OPEN_XP);
  });

  it('does NOT farm XP by splitting into many short-term dust positions across separate days (the M-1 defect this guard closes)', () => {
    // 10 positions, one per day, each on a valid (minAmount-set) product, but only
    // the first 3 concurrently-active ones ever count — the rest are always the
    // 4th+ concurrent position since none of them mature in between.
    const term = 1000 * DAY_MS;
    const positions = Array.from({ length: 10 }, (_, i) =>
      pos({ id: `p${i}`, startAt: new Date(i * DAY_MS), maturityAt: new Date(i * DAY_MS + term) }));
    const s = deriveDeepCoreState(positions, [], OPEN_SETTINGS, new Date(), DAY_MS);
    expect(s.xpBreakdown.charterOpen).toBe(3 * CHARTER_OPEN_XP);
  });
});

describe('charterCompleteXp — deep-core-02 §2 formula', () => {
  it('min(300, floor(10×termDays/3))', () => {
    expect(charterCompleteXp(90)).toBe(300); // spec anchor: 90-day term = 300
    expect(charterCompleteXp(30)).toBe(100);
    expect(charterCompleteXp(9999)).toBe(300); // capped
  });
});

describe('xp.charter_complete / sv.charter_complete', () => {
  it('awards only for positions that left ACTIVE with every day paid', () => {
    const positions = [
      pos({ id: 'p1', status: 'MATURED', termDays: 90, daysPaid: 90 }),
      pos({ id: 'p2', status: 'ACTIVE', termDays: 90, daysPaid: 90 }), // still active — not counted
      pos({ id: 'p3', status: 'MATURED', termDays: 90, daysPaid: 10 }), // matured but underpaid — not counted (defensive)
    ];
    const s = deriveDeepCoreState(positions, [], OPEN_SETTINGS, new Date(), DAY_MS);
    expect(s.xpBreakdown.charterComplete).toBe(300);
    expect(s.svBreakdown.charterComplete).toBe(50);
  });
});

describe('wells — 05 AC-S12 (size is termDays-relative, never principal-based)', () => {
  it('relativeSize is termDays / the user\'s own longest-ever term, independent of principal', () => {
    const positions = [
      pos({ id: 'p1', termDays: 30, principal: '1000000' }),
      pos({ id: 'p2', termDays: 90, principal: '1' }),
    ];
    const s = deriveDeepCoreState(positions, [], OPEN_SETTINGS, new Date(), DAY_MS);
    const w1 = s.wells.find((w) => w.positionId === 'p1')!;
    const w2 = s.wells.find((w) => w.positionId === 'p2')!;
    expect(w2.relativeSize).toBe(1);
    expect(w1.relativeSize).toBeCloseTo(30 / 90);
  });

  it('a matured position stays visible (recentlyMatured) for 24h, per 05 §3.2', () => {
    const now = new Date(1_000_000_000);
    const justMatured = pos({ id: 'p1', status: 'MATURED', maturityAt: new Date(now.getTime() - 1000) });
    const longMatured = pos({ id: 'p2', status: 'MATURED', maturityAt: new Date(now.getTime() - 25 * 60 * 60 * 1000) });
    const s = deriveDeepCoreState([justMatured, longMatured], [], OPEN_SETTINGS, now, DAY_MS);
    expect(s.wells.map((w) => w.positionId)).toEqual(['p1']);
  });
});

describe('AC-P8 analogue — principal never feeds XP/SV', () => {
  it('two positions differing only in principal produce identical XP/SV', () => {
    const cheap = [pos({ id: 'p1', principal: '1' })];
    const expensive = [pos({ id: 'p1', principal: '999999999' })];
    const a = deriveDeepCoreState(cheap, [], OPEN_SETTINGS, new Date(), DAY_MS);
    const b = deriveDeepCoreState(expensive, [], OPEN_SETTINGS, new Date(), DAY_MS);
    expect(a.xp.xpTotal).toBe(b.xp.xpTotal);
    expect(a.svEarned).toBe(b.svEarned);
  });
});
