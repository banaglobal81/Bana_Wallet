import { test, expect } from '@playwright/test';
import { E2E } from './global-setup';

// docs/specs/staking-page-v2-screen-flow-frd.md — the DEEP CORE-centric v2
// layout. Product list and position list moved from the page body into the
// S-STAKE / S-POS sheets (L-1); B2 YIELD PANEL now shows the server-ledgered
// recorded yield instead of a client-computed live "accrued interest"
// counter (R-U7), which for this fixture is seeded at "0" (`paidInterest`
// starts at 0 until the daily settlement worker actually runs) rather than
// the old client-side projection.
test.describe('Staking', () => {
  test('user logs in and can see the product (in the Stake sheet) and their position (in the Positions sheet)', async ({ page }) => {
    // 1. Log in through the real credentials form.
    await page.goto('/en/login');
    await page.fill('#email', E2E.email);
    await page.fill('#password', E2E.password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30_000 });

    // 2. Open the Staking page.
    await page.goto('/en/staking');
    await expect(page.getByTestId('staking-title')).toBeVisible();

    // 3. B2 YIELD PANEL renders a row for the seeded coin, with the
    // recorded-yield claim slot showing UNAVAILABLE (PS-A: no claim rail).
    await expect(page.getByTestId('yield-panel')).toBeVisible();
    await expect(page.getByTestId('claim-slot-unavailable').first()).toBeVisible();

    // 4. S-STAKE (opened via B3 [Stake]): the seeded product's daily rate is shown.
    await page.getByTestId('vault-stake-button').click();
    await expect(page.getByText(`${E2E.rate}%`).first()).toBeVisible();
    await page.keyboard.press('Escape').catch(() => {});
    await page.locator('[data-testid="staking-sheet"] button[aria-label="Close"]').click();

    // 5. S-POS (opened via B3 [My positions]): the seeded position is shown,
    // with its principal and its server-recorded yield (not a live counter).
    await page.getByTestId('vault-positions-button').click();
    const position = page.getByTestId('staking-position').first();
    await expect(position).toBeVisible();
    await expect(position).toContainText(E2E.principal); // 5000
    await expect(page.getByTestId('position-recorded').first()).toContainText('0');
  });
});
