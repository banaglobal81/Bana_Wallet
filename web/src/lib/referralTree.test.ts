// docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md §6.1 (P-28,
// CUT-5 / T-10) regression coverage for referralTree.getDownline:
//   - reads StakePositionV2 (baseDailyRatePct), NOT the legacy v1 StakePosition
//     table (dailyRatePct) — post-CUT-3, v1 never receives new rows, so reading it
//     silently returns 0 for every user (no error) and zeroes out referral
//     commissions (the "quiet 0 regression").
//
// This suite must be able to tell apart:
//   (a) "0 is the CORRECT result" — a downline member has legacy v1 rows but no
//       V2 rows (post-cutover, nobody is adding V2 positions for them yet).
//   (b) "0 is a REGRESSION" — a downline member has real V2 rows, but the query
//       is still (or again) pointed at v1.
//
// To do that without depending on a live Postgres instance in `npm test` (every
// other test in this suite mocks @/lib/db — see docs/architecture/harness.md), the
// mock below doesn't hardcode "assume V2 is queried". Instead it parses the ACTUAL
// SQL text the tagged template produces (the literal strings shipped in
// referralTree.ts) to decide which fixture table/column to aggregate from. If
// getDownline's SQL ever regresses back to "StakePosition"/"dailyRatePct", this
// mock would follow it there — and the assertions below (hardcoded expected sums
// per fixture, independent of the mock's own arithmetic) would then fail.
import { afterEach, describe, expect, it, vi } from 'vitest';
import Decimal from 'decimal.js';

interface FixtureUser {
  id: string;
  email: string;
  referredById: string | null;
}

interface FixturePosition {
  userId: string;
  principal: string;
  status: string;
  rate: string; // dailyRatePct (v1) or baseDailyRatePct (v2), same meaning either way
}

const users: FixtureUser[] = [
  { id: 'root-1', email: 'root@x.com', referredById: null },
  // Case (a): legacy v1 rows only, zero V2 rows — 0 is the CORRECT result.
  { id: 'u-legacy-only', email: 'legacy@x.com', referredById: 'root-1' },
  // Case (b): real V2 rows, zero v1 rows — must NOT be 0.
  { id: 'u-v2', email: 'v2@x.com', referredById: 'root-1' },
  // 2nd-generation member under u-v2, to also exercise depth/lineRootId.
  { id: 'u-v2-child', email: 'v2child@x.com', referredById: 'u-v2' },
];

const v1Positions: FixturePosition[] = [
  // u-legacy-only: v1-only. If getDownline regressed to v1, this user would show
  // activeStake '5000' / dailyInterest '35' instead of the expected '0'/'0'.
  { userId: 'u-legacy-only', principal: '5000', status: 'ACTIVE', rate: '0.7' },
];

const v2Positions: FixturePosition[] = [
  // u-v2: two ACTIVE + one MATURED (must be excluded by the status filter).
  { userId: 'u-v2', principal: '1000', status: 'ACTIVE', rate: '0.5' }, // interest 5
  { userId: 'u-v2', principal: '2000', status: 'ACTIVE', rate: '0.25' }, // interest 5
  { userId: 'u-v2', principal: '500', status: 'MATURED', rate: '1' }, // excluded
  { userId: 'u-v2-child', principal: '400', status: 'ACTIVE', rate: '0.1' }, // interest 0.4
];

// Parses the literal SQL text a `prisma.$queryRaw` tagged template produced and
// aggregates against the fixture table/column it actually names — see file header.
function fakeQueryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
  const raw = strings.reduce(
    (acc, s, i) => acc + s + (i < values.length ? String(values[i]) : ''),
    '',
  );

  const rootId = String(values[0]);

  // activeStake subquery: `FROM "<Table>" p` (first occurrence).
  // dailyInterest subquery: `p.principal::numeric * p."<col>"::numeric` names the
  // rate column, and its own `FROM "<Table>" p` (second occurrence).
  const fromMatches = [...raw.matchAll(/FROM\s+"(\w+)"\s+p\b/g)].map((m) => m[1]);
  const rateColMatch = raw.match(/p\.principal::numeric\s*\*\s*p\."(\w+)"::numeric/);

  const activeTable = fromMatches[0];
  const interestTable = fromMatches[1];
  const rateCol = rateColMatch?.[1];

  const positionsByTable: Record<string, FixturePosition[]> = {
    StakePosition: v1Positions,
    StakePositionV2: v2Positions,
  };

  function activeRows(table: string | undefined, userId: string): FixturePosition[] {
    return (positionsByTable[table ?? ''] ?? []).filter(
      (p) => p.userId === userId && p.status === 'ACTIVE',
    );
  }

  function sumPrincipal(table: string | undefined, userId: string): string {
    return activeRows(table, userId)
      .reduce((acc, p) => acc.plus(p.principal), new Decimal(0))
      .toFixed();
  }

  function sumInterest(table: string | undefined, userId: string): string {
    // rateCol is unused for the sum itself (fixture rows already store "rate"
    // under one field regardless of column name) — it exists purely so a
    // regression to the wrong column name is visible if this assertion is
    // extended later. The table name is what actually decides v1 vs v2 data.
    void rateCol;
    return activeRows(table, userId)
      .reduce((acc, p) => acc.plus(new Decimal(p.principal).times(p.rate).div(100)), new Decimal(0))
      .toFixed();
  }

  // Simulate the recursive CTE walk over the fixture users.
  type TreeRow = { id: string; email: string; depth: number; lineRootId: string };
  const direct = users.filter((u) => u.referredById === rootId);
  const queue: TreeRow[] = direct.map((u) => ({ id: u.id, email: u.email, depth: 1, lineRootId: u.id }));
  const tree: TreeRow[] = [];
  while (queue.length) {
    const cur = queue.shift()!;
    tree.push(cur);
    for (const child of users.filter((u) => u.referredById === cur.id)) {
      queue.push({ id: child.id, email: child.email, depth: cur.depth + 1, lineRootId: cur.lineRootId });
    }
  }

  return Promise.resolve(
    tree.map((t) => ({
      id: t.id,
      email: t.email,
      depth: t.depth,
      lineRootId: t.lineRootId,
      activeStake: sumPrincipal(activeTable, t.id),
      dailyInterest: sumInterest(interestTable, t.id),
    })),
  );
}

const queryRawMock = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) =>
  fakeQueryRaw(strings, ...values),
);
vi.mock('@/lib/db', () => ({
  prisma: { $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => queryRawMock(strings, ...values) },
}));

import { getDownline } from './referralTree';

describe('getDownline (CUT-5 / T-10 — V2 migration, P-28 quiet-0 regression guard)', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('case (a): a downline member with ONLY legacy v1 rows correctly reports 0 — this is NOT a regression', async () => {
    const result = await getDownline('root-1');
    const legacy = result.find((m) => m.id === 'u-legacy-only');

    expect(legacy).toBeDefined();
    expect(legacy!.activeStake).toBe('0');
    expect(legacy!.dailyInterest).toBe('0');
  });

  it('case (b): a downline member with real V2 rows reports the correct nonzero sums (would 0 out if the query regressed to v1)', async () => {
    const result = await getDownline('root-1');
    const v2 = result.find((m) => m.id === 'u-v2');

    expect(v2).toBeDefined();
    expect(v2!.depth).toBe(1);
    expect(v2!.lineRootId).toBe('u-v2');
    // 1000 + 2000 (the 500 MATURED row is excluded by the status filter).
    expect(v2!.activeStake).toBe('3000');
    // 1000*0.5/100 + 2000*0.25/100 = 5 + 5.
    expect(v2!.dailyInterest).toBe('10');
  });

  it('carries a 2nd-generation V2 member correctly (depth + lineRootId + its own V2 sums)', async () => {
    const result = await getDownline('root-1');
    const child = result.find((m) => m.id === 'u-v2-child');

    expect(child).toBeDefined();
    expect(child!.depth).toBe(2);
    expect(child!.lineRootId).toBe('u-v2'); // rolls up to the 1st-gen line root, not itself
    expect(child!.activeStake).toBe('400');
    expect(child!.dailyInterest).toBe('0.4');
  });

  it('regression guard: the shipped SQL text names StakePositionV2/baseDailyRatePct, never the bare v1 table/column', async () => {
    await getDownline('root-1');

    expect(queryRawMock).toHaveBeenCalledTimes(1);
    const [strings] = queryRawMock.mock.calls[0] as [TemplateStringsArray];
    const raw = strings.join('');

    expect(raw).toContain('"StakePositionV2"');
    expect(raw).toContain('"baseDailyRatePct"');
    // Guards against a partial/typo revert (e.g. table fixed but column left as
    // the v1 name) — "StakePosition" alone (not followed by V2) must not appear.
    expect(raw).not.toMatch(/"StakePosition"(?!V2)/);
    expect(raw).not.toContain('"dailyRatePct"');
  });
});
