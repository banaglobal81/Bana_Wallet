import { test, expect, type Page } from '@playwright/test';
import { E2E_ADMIN } from './global-setup';

async function loginAsAdmin(page: Page) {
  await page.goto('/en/login');
  await page.fill('#email', E2E_ADMIN.email);
  await page.fill('#password', E2E_ADMIN.password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30_000 });
}

// A unique term so this product never collides with the standard BANA tiers.
const TERM = 45;
const rowByTerm = (page: Page) => page.locator(`[data-testid="product-row"][data-term="${TERM}"]`);

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

    // --- Create (coin is locked to BANA) ---
    await page.getByTestId('new-product-btn').click();
    await page.getByTestId('np-name').fill('E2E 45-Day');
    await page.getByTestId('np-term').fill(String(TERM));
    await page.getByTestId('np-rate').fill('0.3');
    await page.getByTestId('np-submit').click();

    const row = rowByTerm(page);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('E2E 45-Day');
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
