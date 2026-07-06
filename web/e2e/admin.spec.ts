import { test, expect, type Page } from '@playwright/test';
import { E2E_ADMIN } from './global-setup';

// Every admin route. Each is loaded as the seeded ADMIN and asserted to render
// (correct status, not bounced to /login, an <h1> heading, no crash overlay).
const ADMIN_PAGES: Array<{ path: string; name: string }> = [
  { path: '/en/admin/dashboard', name: 'Dashboard' },
  { path: '/en/admin/staking', name: 'Staking' },
  { path: '/en/admin/coins', name: 'Coins' },
  { path: '/en/admin/users', name: 'Users' },
  { path: '/en/admin/withdrawals', name: 'Withdrawals' },
  { path: '/en/admin/settlement', name: 'Settlement' },
  { path: '/en/admin/settings', name: 'Settings' },
  { path: '/en/admin/settings/security', name: 'Security' },
  { path: '/en/admin/settings/security/email', name: 'Security · Email' },
  { path: '/en/admin/settings/security/devices', name: 'Security · Devices' },
];

async function loginAsAdmin(page: Page) {
  await page.goto('/en/login');
  await page.fill('#email', E2E_ADMIN.email);
  await page.fill('#password', E2E_ADMIN.password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30_000 });
}

test.describe('Admin pages', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  for (const { path, name } of ADMIN_PAGES) {
    test(`loads ${name} (${path})`, async ({ page }) => {
      const res = await page.goto(path, { waitUntil: 'domcontentloaded' });

      // 1. Server returned a non-error status.
      expect(res?.status(), `HTTP status for ${path}`).toBeLessThan(400);

      // 2. Admin was not bounced to the login page (auth + ADMIN role held).
      await expect(page).not.toHaveURL(/\/login/);
      expect(page.url(), `stayed on admin route ${path}`).toContain('/admin/');

      // 3. The page rendered its heading → it mounted without crashing.
      await expect(page.locator('h1').first()).toBeVisible();

      // 4. No Next.js runtime error overlay / crash text.
      await expect(page.getByText('Application error', { exact: false })).toHaveCount(0);
      await expect(page.getByText('missing required error components', { exact: false })).toHaveCount(0);
    });
  }

  test('non-admin is redirected away from /admin', async ({ page, context }) => {
    // A logged-out browser hitting an admin route must not see it.
    await context.clearCookies();
    await page.goto('/en/admin/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});
