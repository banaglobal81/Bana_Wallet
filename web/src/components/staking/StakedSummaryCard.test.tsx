// @vitest-environment jsdom
//
// docs/specs/staking-page-v2-screen-flow-frd-addendum-ss.md §4 (SS-3) —
// AC-V5' / AC-SS-1 / AC-SS-2 / AC-SS-3 / AC-SS-4.
//
// This is the permanent regression test the addendum recommends in place of
// browser E2E (blocked by the auth wall): mount the card with
// `stakingWorkerEnabled=false` semantics (no server-side accrual — the mock
// staking API response never changes), advance fake timers well past the old
// 1s tick, and assert the rendered money figures are byte-identical. This
// locks AC-SS-4 (the *result* users see) — a separate concern from AC-SS-1
// (no timer drives the value at all), which this file also checks directly
// against the component source.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const mockGetStakePositionsAndGame = vi.fn();
const mockGetStakingRewards = vi.fn();

vi.mock('../../utils/stakingApi', () => ({
  getStakePositionsAndGame: () => mockGetStakePositionsAndGame(),
  getStakingRewards: () => mockGetStakingRewards(),
}));

vi.mock('../wallet/CoinAvatar', () => ({
  default: ({ symbol }: { symbol: string }) => <span data-testid={`avatar-${symbol}`} />,
}));

import StakedSummaryCard from './StakedSummaryCard';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('StakedSummaryCard (addendum SS §4)', () => {
  it('AC-SS-2: renders nothing when nothing staked and nothing recorded (SS-2d)', async () => {
    mockGetStakePositionsAndGame.mockResolvedValue({ positions: [], game: null, lockedPrincipal: {} });
    mockGetStakingRewards.mockResolvedValue({ totalByCoin: {}, payouts: [], hasMore: false, nextCursor: null, total: 0 });

    const { container } = render(<StakedSummaryCard />);
    await waitFor(() => expect(mockGetStakePositionsAndGame).toHaveBeenCalled());
    // give the microtask queue a tick to flush setState
    await waitFor(() => expect(container.querySelector('button')).toBeNull());
  });

  it('AC-SS-2/AC-SS-3: renders one row per coin, each figure server-sourced, never summed across coins', async () => {
    mockGetStakePositionsAndGame.mockResolvedValue({
      positions: [],
      game: null,
      lockedPrincipal: { BANA: '1000.5', ETH: '2.25' },
    });
    mockGetStakingRewards.mockResolvedValue({
      totalByCoin: { BANA: '12.75', ETH: '0.001' },
      payouts: [],
      hasMore: false,
      nextCursor: null,
      total: 2,
    });

    render(<StakedSummaryCard />);

    await waitFor(() => expect(screen.getByTestId('avatar-BANA')).not.toBeNull());
    expect(screen.getByTestId('avatar-ETH')).not.toBeNull();

    // Each coin's principal and recorded-yield figures rendered verbatim
    // (decimal.js toSignificantDigits — not summed with the other coin's).
    expect(screen.getByText('1000.5')).not.toBeNull();
    expect(screen.getByText('12.75')).not.toBeNull();
    expect(screen.getByText('2.25')).not.toBeNull();
    expect(screen.getByText('0.001')).not.toBeNull();

    // No accidental cross-coin sum anywhere in the rendered output.
    expect(screen.queryByText('1002.75')).toBeNull(); // 1000.5 + 2.25
    expect(screen.queryByText('12.751')).toBeNull(); // 12.75 + 0.001
  });

  it('AC-SS-4: with stakingWorkerEnabled=false (server figures static), the rendered amounts do not change after 10 minutes of fake-timer advance', async () => {
    vi.useFakeTimers();
    mockGetStakePositionsAndGame.mockResolvedValue({
      positions: [],
      game: null,
      lockedPrincipal: { BANA: '500' },
    });
    mockGetStakingRewards.mockResolvedValue({
      totalByCoin: { BANA: '3.14159265' },
      payouts: [],
      hasMore: false,
      nextCursor: null,
      total: 1,
    });

    const { container } = render(<StakedSummaryCard />);

    // Flush the initial data-load effect (real microtasks under fake timers).
    await vi.waitFor(() => expect(container.querySelector('button')).not.toBeNull());

    const before = container.innerHTML;

    // Advance far past the old 1s setInterval tick — 10 minutes.
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);

    const after = container.innerHTML;
    expect(after).toBe(before);
    // toSignificantDigits(8) rounds 3.14159265 -> 3.1415927 (component's own
    // display rounding — not a live/derived value; still expected constant).
    expect(after).toContain('3.1415927');
    expect(after).toContain('500');
  });

  it('AC-SS-1: no setInterval/setTimeout-loop/requestAnimationFrame in the component source', () => {
    const src = readFileSync(path.join(__dirname, 'StakedSummaryCard.tsx'), 'utf8');
    expect(src).not.toMatch(/setInterval/);
    expect(src).not.toMatch(/requestAnimationFrame/);
  });

  it("AC-V5': does not import accruedInterest from lib/stakingMath", () => {
    const src = readFileSync(path.join(__dirname, 'StakedSummaryCard.tsx'), 'utf8');
    expect(src).not.toMatch(/accruedInterest/);
    expect(src).not.toMatch(/stakingMath/);
  });
});
