import { test, expect } from '@playwright/test';
import { SPOT_PATH } from './support/riobx';

/**
 * Authenticated BTC/USDT spot-trading page. Runs under the `authenticated`
 * project, which reuses the session captured by `auth.setup.ts`.
 *
 * Selectors here are intentionally tolerant; refine them against the real
 * logged-in DOM after the first run with valid RIOBX_* credentials.
 */
test.describe('BTC/USDT spot page (authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SPOT_PATH, { waitUntil: 'domcontentloaded' });
  });

  test('loads the spot page without bouncing to login', async ({ page }) => {
    await expect(page).toHaveURL(/\/spot\/BTC_USDT/);
    await expect(page).not.toHaveURL(/\/auth\/login/);
  });

  test('shows the BTC/USDT trading pair', async ({ page }) => {
    await expect(page.getByText(/BTC/).first()).toBeVisible();
    await expect(page.getByText(/USDT/).first()).toBeVisible();
  });

  test('renders buy and sell order controls', async ({ page }) => {
    await expect(page.getByText(/^Buy$/i).first()).toBeVisible();
    await expect(page.getByText(/^Sell$/i).first()).toBeVisible();
  });

  test('renders a live price and captures a screenshot', async ({ page }) => {
    // A spot page should surface at least one numeric price somewhere.
    await expect(page.getByText(/\d[\d,]*\.\d+/).first()).toBeVisible();
    await page.screenshot({ path: 'test-results/spot-btcusdt.png', fullPage: true });
  });
});
