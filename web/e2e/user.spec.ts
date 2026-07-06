import { test, expect, type Page } from '@playwright/test';
import { E2E } from './global-setup';

// Every authenticated user-facing page. Loaded as the seeded USER and asserted
// to render (status, not bounced to /login, a heading, no crash overlay).
const USER_PAGES: Array<{ path: string; name: string }> = [
  { path: '/en/portfolio', name: 'Portfolio' },
  { path: '/en/wallet', name: 'Wallet' },
  { path: '/en/swap', name: 'Swap' },
  { path: '/en/staking', name: 'Staking' },
  { path: '/en/deposit', name: 'Deposit' },
  { path: '/en/withdraw', name: 'Withdraw' },
  { path: '/en/activity', name: 'Activity' },
  { path: '/en/settings', name: 'Settings' },
  { path: '/en/settings/security', name: 'Security' },
  { path: '/en/settings/security/email', name: 'Security · Email' },
  { path: '/en/settings/security/devices', name: 'Security · Devices' },
];

async function loginAsUser(page: Page) {
  await page.goto('/en/login');
  await page.fill('#email', E2E.email);
  await page.fill('#password', E2E.password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30_000 });
}

test.describe('User pages', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
  });

  for (const { path, name } of USER_PAGES) {
    test(`loads ${name} (${path})`, async ({ page }) => {
      const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
      expect(res?.status(), `HTTP status for ${path}`).toBeLessThan(400);
      await expect(page).not.toHaveURL(/\/login/);
      // A heading rendered → the page mounted without crashing.
      await expect(page.getByRole('heading').first()).toBeVisible();
      await expect(page.getByText('Application error', { exact: false })).toHaveCount(0);
      await expect(page.getByText('missing required error components', { exact: false })).toHaveCount(0);
    });
  }

  test('a regular USER cannot reach the admin area', async ({ page }) => {
    // Logged in as USER (not ADMIN) → admin routes must redirect away.
    await page.goto('/en/admin/dashboard');
    await expect(page).not.toHaveURL(/\/admin\//, { timeout: 15_000 });
  });
});
