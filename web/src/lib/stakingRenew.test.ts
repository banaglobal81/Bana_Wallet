// A3-C1 regression coverage (docs/specs/staking-auto-renew-assumption-ruling.md
// §3, P2): `matureOrRenewPosition` must fail CLOSED when the position's owner
// row cannot be found (StakePosition.userId has no FK to User, so an orphaned
// position is structurally possible). Before this fix,
// `userDisabled: user?.disabled ?? false` failed OPEN — an orphaned position
// would renew, minting a live successor position with no owner and no email
// address.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const txExecuteRawMock = vi.fn();
const txStakePositionFindUniqueMock = vi.fn();
const txStakePositionUpdateMock = vi.fn();
const txStakePositionCreateMock = vi.fn();
const txStakePositionFindManyMock = vi.fn();
const txStakingProductFindUniqueMock = vi.fn();
const txUserFindUniqueMock = vi.fn();

// Top-level (non-transaction) prisma calls — used by the catch-block retry
// counter and by sendRenewalOutcomeIfNeeded. Kept as SEPARATE mocks from the
// tx-scoped ones above so a test can assert "the email path was never
// touched" precisely (the FAILED_ACCOUNT_INACTIVE case must stay silent).
const topStakePositionFindUniqueMock = vi.fn();
const topStakePositionUpdateManyMock = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        $executeRaw: (...args: unknown[]) => txExecuteRawMock(...args),
        stakePosition: {
          findUnique: (...args: unknown[]) => txStakePositionFindUniqueMock(...args),
          update: (...args: unknown[]) => txStakePositionUpdateMock(...args),
          create: (...args: unknown[]) => txStakePositionCreateMock(...args),
          findMany: (...args: unknown[]) => txStakePositionFindManyMock(...args),
        },
        stakingProduct: { findUnique: (...args: unknown[]) => txStakingProductFindUniqueMock(...args) },
        user: { findUnique: (...args: unknown[]) => txUserFindUniqueMock(...args) },
      }),
    stakePosition: {
      findUnique: (...args: unknown[]) => topStakePositionFindUniqueMock(...args),
      updateMany: (...args: unknown[]) => topStakePositionUpdateManyMock(...args),
    },
  },
}));

const sendRenewalOutcomeEmailMock = vi.fn();
vi.mock('@/lib/email/resend', () => ({
  sendRenewalOutcomeEmail: (...args: unknown[]) => sendRenewalOutcomeEmailMock(...args),
}));

import { matureOrRenewPosition } from './stakingRenew';

const NOW = new Date('2026-08-10T00:00:00.000Z');

function activePosition(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'pos-1',
    userId: 'orphan-user',
    niaUserId: 'nia-1',
    productId: 'prod-1',
    coin: 'USDT',
    principal: '1000',
    dailyRatePct: '0.05',
    termDays: 30,
    maturityAt: NOW,
    status: 'ACTIVE',
    autoRenew: true,
    grantedByAdminId: null,
    renewalAttempts: 0,
    ...overrides,
  };
}

function openProduct(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'prod-1',
    coin: 'USDT',
    status: 'OPEN',
    termDays: 30,
    dailyRatePct: '0.05',
    minAmount: null,
    maxAmount: null,
    capacity: null,
    ...overrides,
  };
}

describe('matureOrRenewPosition — missing user row (A3-C1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txExecuteRawMock.mockResolvedValue(undefined);
    txStakePositionUpdateMock.mockResolvedValue({});
    txStakePositionFindManyMock.mockResolvedValue([]); // activeOthers
    txStakingProductFindUniqueMock.mockResolvedValue(openProduct());
  });

  it('treats a missing user row as FAILED_ACCOUNT_INACTIVE (fail closed), not RENEWED', async () => {
    txStakePositionFindUniqueMock.mockResolvedValue(activePosition());
    txUserFindUniqueMock.mockResolvedValue(null); // orphaned position — owner row not found

    const outcome = await matureOrRenewPosition('pos-1', NOW);

    expect(outcome).toEqual({ outcome: 'RENEWAL_FAILED', renewalStatus: 'FAILED_ACCOUNT_INACTIVE' });
    expect(txStakePositionUpdateMock).toHaveBeenCalledWith({
      where: { id: 'pos-1' },
      data: { status: 'MATURED', renewalStatus: 'FAILED_ACCOUNT_INACTIVE', renewalProcessedAt: NOW, paidAt: NOW },
    });
    // No successor position minted for an orphaned owner.
    expect(txStakePositionCreateMock).not.toHaveBeenCalled();
  });

  it('stays silent — no outcome email is attempted for a missing-user renewal failure', async () => {
    txStakePositionFindUniqueMock.mockResolvedValue(activePosition());
    txUserFindUniqueMock.mockResolvedValue(null);

    await matureOrRenewPosition('pos-1', NOW);

    // sendRenewalOutcomeIfNeeded (top-level prisma.stakePosition.findUnique +
    // sendRenewalOutcomeEmail) must never run for FAILED_ACCOUNT_INACTIVE —
    // same silence rule as the already-disabled-account case.
    expect(topStakePositionFindUniqueMock).not.toHaveBeenCalled();
    expect(sendRenewalOutcomeEmailMock).not.toHaveBeenCalled();
  });

  it('control: a present, non-disabled user still renews normally', async () => {
    txStakePositionFindUniqueMock.mockResolvedValue(activePosition());
    txUserFindUniqueMock.mockResolvedValue({ email: 'owner@example.com', locale: 'en', disabled: false });
    txStakePositionCreateMock.mockResolvedValue({ id: 'pos-2' });
    topStakePositionFindUniqueMock.mockResolvedValue(null); // sendRenewalOutcomeIfNeeded no-ops on missing row

    const outcome = await matureOrRenewPosition('pos-1', NOW);

    expect(outcome).toEqual({ outcome: 'RENEWED', newPositionId: 'pos-2' });
    expect(txStakePositionCreateMock).toHaveBeenCalled();
  });
});
