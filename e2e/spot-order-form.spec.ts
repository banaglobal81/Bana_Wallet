import { test, expect, type Locator } from '@playwright/test';
import { SPOT_PATH } from './support/riobx';

/**
 * READ-ONLY order-form checks for BTC/USDT. Exercises the order entry UI
 * (Limit/Market order types, Price & Total fields, value entry) WITHOUT ever
 * submitting an order — riobx.com is a live production exchange.
 *
 * Runs under the `authenticated` project (reuses the saved session).
 *
 * Real DOM notes (verified while logged in):
 *  - Buy and Sell forms render side-by-side, so Price/Total each resolve to 2
 *    elements; we target `.first()` (the Buy side).
 *  - Price is a masked decimal input pre-filled with the live market price.
 *    `.fill()` appends to a masked input, so we clear explicitly first.
 *  - There is no "Amount" label; the inputs are labelled "Price" and "Total".
 */

/** Clear a masked number input, then type a value (fill() alone appends). */
async function setMasked(input: Locator, value: string) {
  await input.click();
  await input.press('ControlOrMeta+a');
  await input.press('Backspace');
  await input.pressSequentially(value);
}

test.describe('BTC/USDT order form — read-only (authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SPOT_PATH, { waitUntil: 'domcontentloaded' });
    await expect(page).not.toHaveURL(/\/auth\/login/);
  });

  test('Limit / Market order types are selectable', async ({ page }) => {
    const limit = page.getByRole('button', { name: /^limit$/i }).first();
    const market = page.getByRole('button', { name: /^market$/i }).first();
    await expect(limit).toBeVisible();
    await expect(market).toBeVisible();
    // Toggling order type must not blow up or bounce us off the page.
    await market.click();
    await limit.click();
    await expect(page).toHaveURL(/\/spot\/BTC_USDT/);
  });

  test('Price field is pre-filled with the live market price', async ({ page }) => {
    const price = page.getByLabel('Price').first();
    await expect(price).toBeVisible();
    // A live spot price renders as a formatted number, e.g. "62,989.99".
    await expect(price).toHaveValue(/\d[\d,]*\.\d+/);
  });

  test('editing Price reflects a custom value (no submit)', async ({ page }) => {
    await page.getByRole('button', { name: /^limit$/i }).first().click();

    const price = page.getByLabel('Price').first();
    await expect(price).toBeVisible();

    // Far-from-market value: harmless even though we never submit.
    await setMasked(price, '1000');
    // Masked input may render with a thousands separator ("1,000").
    await expect(price).toHaveValue(/^1,?000(\.0*)?$/);

    const total = page.getByLabel('Total').first();
    await expect(total).toBeVisible();

    await page.screenshot({ path: 'test-results/spot-order-form.png', fullPage: true });

    // SAFETY: this test deliberately never clicks a Buy/Sell submit button.
  });
});
