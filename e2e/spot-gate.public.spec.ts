import { test, expect } from '@playwright/test';
import { SPOT_PATH } from './support/riobx';

/**
 * No credentials required. Verifies the spot page is auth-gated and that the
 * login form renders the fields the authenticated flow depends on.
 */
test.describe('Spot page auth gate (public)', () => {
  test('unauthenticated visit to BTC_USDT redirects to login', async ({ page }) => {
    await page.goto(SPOT_PATH, { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/auth\/login/);
    // The redirect preserves the intended destination.
    await expect(page).toHaveURL(/next=%2Fspot%2FBTC_USDT/);
  });

  test('login form exposes the expected fields', async ({ page }) => {
    await page.goto(SPOT_PATH, { waitUntil: 'domcontentloaded' });

    await expect(page.getByPlaceholder('Enter ID or Email')).toBeVisible();
    await expect(page.getByPlaceholder('Enter Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log In', exact: true })).toBeVisible();
  });
});
