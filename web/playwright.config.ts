import { defineConfig, devices } from '@playwright/test';

// E2E for the staking UI. globalSetup seeds a test user + a staking product +
// a back-dated position (so real accrued interest shows); the spec logs in
// through the real login form and verifies the Staking page.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/api/auth/csrf',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
