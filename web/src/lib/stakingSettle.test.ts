// A4-C1 regression coverage (docs/specs/staking-auto-renew-assumption-ruling.md
// §4, P1 — "the only item I care most about in this ruling, and the only one
// with a live consequence for user money"): a RENEWAL_DEFERRED outcome from
// matureOrRenewPosition must be visible on SettlementResult. Before this fix,
// SettlementResult.renewed/renewalsFailed/matured were incremented on every
// outcome EXCEPT RENEWAL_DEFERRED, so a deferred renewal — the one outcome
// that leaves a matured user's principal locked with no further interest
// accruing — looked, on the admin settlement view, exactly like nothing had
// happened.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const stakePositionFindManyMock = vi.fn();
const stakingPayoutCreateManyMock = vi.fn();
const stakePositionUpdateMock = vi.fn();
const matureOrRenewPositionMock = vi.fn();
const sendRenewalOutcomeIfNeededMock = vi.fn();
const payReferralBonusesMock = vi.fn();
const sendMaturityReminderEmailMock = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    stakePosition: {
      findMany: (...args: unknown[]) => stakePositionFindManyMock(...args),
      update: (...args: unknown[]) => stakePositionUpdateMock(...args),
    },
    stakingPayout: {
      createMany: (...args: unknown[]) => stakingPayoutCreateManyMock(...args),
    },
  },
}));

vi.mock('@/lib/stakingRenew', () => ({
  matureOrRenewPosition: (...args: unknown[]) => matureOrRenewPositionMock(...args),
  sendRenewalOutcomeIfNeeded: (...args: unknown[]) => sendRenewalOutcomeIfNeededMock(...args),
  AUTO_RENEW_MAX_TERM_DAYS: 90,
}));

vi.mock('@/lib/referralBonus', () => ({
  payReferralBonuses: (...args: unknown[]) => payReferralBonusesMock(...args),
}));

vi.mock('@/lib/email/resend', () => ({
  sendMaturityReminderEmail: (...args: unknown[]) => sendMaturityReminderEmailMock(...args),
}));

import { runStakingSettlement } from './stakingSettle';

const NOW = new Date('2026-08-10T00:00:00.000Z');

function duePosition(overrides: Partial<Record<string, unknown>> = {}) {
  // startAt far enough in the past that daysElapsed(startAt, NOW, termDays)
  // >= termDays — i.e. the position is due for its maturity decision.
  return {
    id: 'pos-1',
    userId: 'user-1',
    coin: 'USDT',
    principal: '1000',
    dailyRatePct: '0.05',
    termDays: 30,
    startAt: new Date(NOW.getTime() - 40 * 24 * 60 * 60 * 1000),
    daysPaid: 30, // already fully paid — isolates the maturity-decision branch
    ...overrides,
  };
}

describe('runStakingSettlement — renewalsDeferred (A4-C1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stakingPayoutCreateManyMock.mockResolvedValue({ count: 0 });
    stakePositionUpdateMock.mockResolvedValue({});
    sendRenewalOutcomeIfNeededMock.mockResolvedValue(undefined);
    payReferralBonusesMock.mockResolvedValue({ enabled: false, dayKey: '0', uplinesPaid: 0, totalPaid: '0' });
    sendMaturityReminderEmailMock.mockResolvedValue(undefined);

    // Pass 1: one ACTIVE position, already fully paid (daysPaid === termDays)
    // so it goes straight to the maturity decision this cycle.
    // Pass "unpaidMatured" self-heal, Pass 2 reminders, Pass 3 notify retry:
    // all empty so only the outcome-counting branch under test runs.
    stakePositionFindManyMock
      .mockResolvedValueOnce([duePosition()]) // Pass 1: ACTIVE positions
      .mockResolvedValueOnce([]) // self-heal: MATURED && paidAt null
      .mockResolvedValueOnce([]) // Pass 2: reminder candidates
      .mockResolvedValueOnce([]); // Pass 3: notify retry candidates
  });

  it('increments renewalsDeferred, and NOT matured, on a RENEWAL_DEFERRED outcome', async () => {
    matureOrRenewPositionMock.mockResolvedValueOnce({ outcome: 'RENEWAL_DEFERRED' });

    const result = await runStakingSettlement(NOW);

    expect(result.renewalsDeferred).toBe(1);
    // The position is still ACTIVE while deferred — must NOT be counted as
    // matured, or the admin view would double-book it once it later resolves.
    expect(result.matured).toBe(0);
    expect(result.renewed).toBe(0);
    expect(result.renewalsFailed).toBe(0);
  });

  it('control: a RENEWED outcome still increments matured+renewed and NOT renewalsDeferred', async () => {
    matureOrRenewPositionMock.mockResolvedValueOnce({ outcome: 'RENEWED', newPositionId: 'pos-2' });

    const result = await runStakingSettlement(NOW);

    expect(result.matured).toBe(1);
    expect(result.renewed).toBe(1);
    expect(result.renewalsDeferred).toBe(0);
  });

  it('control: a RENEWAL_FAILED outcome still increments matured+renewalsFailed and NOT renewalsDeferred', async () => {
    matureOrRenewPositionMock.mockResolvedValueOnce({ outcome: 'RENEWAL_FAILED', renewalStatus: 'FAILED_PRODUCT_CLOSED' });

    const result = await runStakingSettlement(NOW);

    expect(result.matured).toBe(1);
    expect(result.renewalsFailed).toBe(1);
    expect(result.renewalsDeferred).toBe(0);
  });

  it('SettlementResult always carries a renewalsDeferred field (shape regression)', async () => {
    matureOrRenewPositionMock.mockResolvedValueOnce({ outcome: 'MATURED_NO_RENEWAL' });

    const result = await runStakingSettlement(NOW);

    expect(typeof result.renewalsDeferred).toBe('number');
  });
});
