// docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md §5.2①
// (CUT-4 / T-7) unit coverage for lib/staking.ts's V2-era exports —
// `serializePositionV2` (shared by api/staking/positions/route.ts and
// api/staking/positions/[id]/auto-renew/route.ts), plus the thin
// settleMaturedPositions/lockedPrincipalByCoin delegation to lib/stakingV2.ts
// carried forward unchanged from CUT-3 (T-6).
import { describe, it, expect, vi, afterEach } from 'vitest';

const settleMaturedPositionsV2Mock = vi.fn();
const lockedPrincipalForLocalMock = vi.fn();
vi.mock('@/lib/stakingV2', () => ({
  settleMaturedPositionsV2: (...args: unknown[]) => settleMaturedPositionsV2Mock(...args),
  lockedPrincipalForLocal: (...args: unknown[]) => lockedPrincipalForLocalMock(...args),
}));

const stakePositionV2FindManyMock = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: {
    stakePositionV2: { findMany: (...args: unknown[]) => stakePositionV2FindManyMock(...args) },
  },
}));

import { serializePositionV2, settleMaturedPositions, lockedPrincipalByCoin } from './staking';

describe('serializePositionV2 (rev05 §5.2① field set)', () => {
  const base = {
    id: 'pos-1',
    productId: 'prod-1',
    coin: 'BANA',
    principal: '1000',
    baseDailyRatePct: '0.2',
    termDays: 10,
    startAt: new Date('2026-08-01T00:00:00.000Z'),
    maturityAt: new Date('2026-08-11T00:00:00.000Z'),
    status: 'ACTIVE',
    ledgeredYield: '4',
    daysPaid: 2,
    autoRenew: false,
    renewalStatus: 'NONE',
    renewedIntoPositionId: null,
    renewedFromPositionId: null,
    grantedByAdminId: null,
  };

  it('maps the renamed fields and computes fullInterest/projectedTotal/aprPct from baseDailyRatePct', () => {
    const out = serializePositionV2(base);

    expect(out.baseDailyRatePct).toBe('0.2');
    expect(out.ledgeredYield).toBe('4');
    // 1000 * 0.2/100 * 10 = 20
    expect(out.fullInterest).toBe('20');
    expect(out.projectedTotal).toBe('1020');
    expect(out.aprPct).toBe(aprPctFor('0.2'));
  });

  function aprPctFor(dailyRatePct: string) {
    return (Number(dailyRatePct) * 365).toFixed(2);
  }

  it('never emits the banned v1 concepts (accruedInterest, dailyRatePct, paidInterest, PAID status)', () => {
    const out = serializePositionV2(base) as Record<string, unknown>;

    expect(out.accruedInterest).toBeUndefined();
    expect(out.dailyRatePct).toBeUndefined();
    expect(out.paidInterest).toBeUndefined();
    expect(out.status).not.toBe('PAID');
  });

  it('derives autoRenewEligible from termDays <= AUTO_RENEW_MAX_TERM_DAYS(90) and grantedByAdminId==null', () => {
    expect(serializePositionV2({ ...base, termDays: 90, grantedByAdminId: null }).autoRenewEligible).toBe(true);
    expect(serializePositionV2({ ...base, termDays: 91, grantedByAdminId: null }).autoRenewEligible).toBe(false);
    expect(serializePositionV2({ ...base, termDays: 10, grantedByAdminId: 'admin-1' }).autoRenewEligible).toBe(false);
  });

  it('never serializes grantedByAdminId itself — the admin identity is not the user\'s business', () => {
    const out = serializePositionV2({ ...base, grantedByAdminId: 'admin-1' }) as Record<string, unknown>;
    expect(out.grantedByAdminId).toBeUndefined();
  });
});

describe('settleMaturedPositions / lockedPrincipalByCoin — CUT-3 delegation to lib/stakingV2.ts', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('settleMaturedPositions delegates straight to settleMaturedPositionsV2 with the same userId', async () => {
    settleMaturedPositionsV2Mock.mockResolvedValue(undefined);
    await settleMaturedPositions('user-1');
    expect(settleMaturedPositionsV2Mock).toHaveBeenCalledWith('user-1');
  });

  it('lockedPrincipalByCoin sums lockedPrincipalForLocal per distinct ACTIVE StakePositionV2 coin (never StakePositionV2.principal directly)', async () => {
    stakePositionV2FindManyMock.mockResolvedValue([{ coin: 'BANA' }]);
    lockedPrincipalForLocalMock.mockResolvedValue(new (await import('decimal.js')).default('42'));

    const map = await lockedPrincipalByCoin('user-1');

    expect(stakePositionV2FindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', status: 'ACTIVE' }, distinct: ['coin'] }),
    );
    expect(lockedPrincipalForLocalMock).toHaveBeenCalledWith('user-1', 'BANA');
    expect(map.get('BANA')?.toFixed()).toBe('42');
  });
});
