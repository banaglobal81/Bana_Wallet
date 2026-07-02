import { test, expect } from '@playwright/test';
import { E2E } from './global-setup';

test.describe('Staking', () => {
  test('user logs in and sees the product + their staked position with accrued interest', async ({ page }) => {
    // 1. Log in through the real credentials form.
    await page.goto('/en/login');
    await page.fill('#email', E2E.email);
    await page.fill('#password', E2E.password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30_000 });

    // 2. Open the Staking page.
    await page.goto('/en/staking');
    await expect(page.getByTestId('staking-title')).toBeVisible();

    // 3. Earn section: the seeded product's daily rate is shown.
    await expect(page.getByText(`${E2E.rate}%`).first()).toBeVisible();

    // 4. My Stakes: the seeded position is shown, with principal + live accrued interest.
    const position = page.getByTestId('staking-position').first();
    await expect(position).toBeVisible();
    await expect(position).toContainText(E2E.principal); // 5000

    // accrued = principal × rate% × elapsedDays = 5000 × 0.7% × 5 = 175
    await expect(page.getByTestId('position-accrued').first()).toContainText('175');
  });
});
