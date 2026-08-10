// @vitest-environment jsdom
//
// docs/specs/referral-panel-relocation-frd.md AC-1/AC-2/AC-13 — the
// relocated route renders the panel verbatim (data-testid="referral-panel")
// under localized page chrome, and degrades to a titled-but-cardless page
// (never a crash/blank screen) if `GET /api/referral` fails.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const getReferralMock = vi.fn();
const getReferralEarningsMock = vi.fn();
vi.mock('@/utils/niaApi', () => ({
  getReferral: () => getReferralMock(),
  getReferralEarnings: () => getReferralEarningsMock(),
}));

import ReferralPage from './page';

describe('ReferralPage', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('AC-1 — renders localized page chrome and exactly one referral-panel element', async () => {
    getReferralMock.mockResolvedValue({ code: 'ABC123', link: '/signup?ref=ABC123', directReferrals: 0, invitedBy: null });
    getReferralEarningsMock.mockResolvedValue(null);
    render(<ReferralPage />);
    expect(screen.getByTestId('referral-page')).not.toBeNull();
    expect(screen.getByText('pageTitle')).not.toBeNull();
    expect(screen.getByText('subtitle')).not.toBeNull();
    expect(await screen.findAllByTestId('referral-panel')).toHaveLength(1);
  });

  it('AC-13 — degrades to a titled, non-crashing page when GET /api/referral fails', async () => {
    getReferralMock.mockRejectedValue(new Error('network'));
    getReferralEarningsMock.mockResolvedValue(null);
    render(<ReferralPage />);
    expect(screen.getByTestId('referral-page')).not.toBeNull();
    expect(await screen.findByText('pageTitle')).not.toBeNull();
    expect(screen.queryByTestId('referral-panel')).toBeNull();
  });
});
