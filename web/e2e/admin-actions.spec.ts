import { test, expect, type Page } from '@playwright/test';
import { E2E_ADMIN } from './global-setup';

async function loginAsAdmin(page: Page) {
  await page.goto('/en/login');
  await page.fill('#email', E2E_ADMIN.email);
  await page.fill('#password', E2E_ADMIN.password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30_000 });
}

// docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md §4.2/§4.5 —
// StakingProductV2.termDays is now restricted to the ladder (10/30/90/180/360;
// CP-7′ further gates 180/360 to capacity/rate "0" forever), so an arbitrary term
// like the old v1 test's 45 is no longer a valid creation input at all (the form
// is a <select> over the ladder and the route 400s STAKE_PRODUCT_TERM_INVALID for
// anything else). 90 is used here (a real first-tranche term, §4.5 CP-7′) — since
// that term may legitimately collide with a real "90-Day BANA" catalog product,
// this test disambiguates its own row by a unique NAME, not by term alone.
const TERM = 90;
const PRODUCT_NAME = 'E2E 90-Day Test Product';
const rowByTerm = (page: Page) => page.locator('[data-testid="product-row"]').filter({ hasText: PRODUCT_NAME });

test.describe('Admin staking — interactions', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/en/admin/staking');
    await expect(page.getByRole('heading').first()).toBeVisible();
  });

  test('run settlement now shows a result message', async ({ page }) => {
    await page.getByTestId('run-settlement').click();
    // The result line renders once the settlement returns (paid, or up-to-date).
    await expect(page.getByTestId('settlement-msg')).toBeVisible({ timeout: 20_000 });
  });

  test('create → edit → delete a staking product', async ({ page }) => {
    // Clean any leftover from a prior run (delete if present).
    if (await rowByTerm(page).count()) {
      await rowByTerm(page).getByTestId('p-delete').click();
      await expect(rowByTerm(page)).toHaveCount(0);
    }

    // --- Create (coin is locked to BANA). CP-5′ made minAmount/maxAmount/capacity
    // required at creation, and termDays is now a <select> over the ladder. ---
    await page.getByTestId('new-product-btn').click();
    await page.getByTestId('np-name').fill(PRODUCT_NAME);
    await page.getByTestId('np-term').selectOption(String(TERM));
    await page.getByTestId('np-rate').fill('0.3');
    await page.getByTestId('np-min').fill('100');
    await page.getByTestId('np-max').fill('1000');
    await page.getByTestId('np-capacity').fill('5000');
    await page.getByTestId('np-submit').click();

    const row = rowByTerm(page);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(PRODUCT_NAME);
    await expect(row).toContainText('BANA');
    await expect(row).toContainText('0.3%');

    // --- Edit the daily rate 0.3 → 0.45 ---
    await row.getByTestId('p-edit').click();
    await page.getByTestId('edit-rate').fill('0.45');
    await page.getByTestId('edit-save').click();
    await expect(rowByTerm(page)).toContainText('0.45%');
    // APR recomputes: 0.45 × 365 = 164.25
    await expect(rowByTerm(page)).toContainText('164.25%');

    // --- Delete (no positions → allowed) ---
    await rowByTerm(page).getByTestId('p-delete').click();
    await expect(rowByTerm(page)).toHaveCount(0);
  });
});
