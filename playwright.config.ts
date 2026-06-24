import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Minimal, dependency-free loader for an untracked `.env.e2e` file so the
 * RIOBX_* credentials can live outside the shell. Values already present in
 * the real environment win (so CI secrets are never overridden).
 */
function loadE2EEnv(file = '.env.e2e') {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadE2EEnv();

/**
 * Playwright E2E config for the Riobx spot trading flow.
 *
 * Credentials are read from the environment (never committed):
 *   RIOBX_EMAIL, RIOBX_PASSWORD   — test account login
 *   RIOBX_BASE_URL                — defaults to https://riobx.com
 *
 * Auth runs once in `auth.setup.ts`, which writes a Playwright
 * storageState to `e2e/.auth/user.json`. The spot specs reuse that
 * session so each test does not re-login.
 */
const BASE_URL = process.env.RIOBX_BASE_URL ?? 'https://riobx.com';

export default defineConfig({
  testDir: './e2e',
  // Keep the public/exploratory side of the suite runnable without creds;
  // tests that need auth depend on the `setup` project below.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: BASE_URL,
    locale: 'en-US',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    // 1. Log in once, persist the session.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },

    // 2. Public checks — no login required.
    {
      name: 'public',
      testMatch: /.*\.public\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    // 3. Authenticated spot-trading checks — reuse the saved session.
    {
      name: 'authenticated',
      testMatch: /.*\.spec\.ts/,
      testIgnore: /.*\.public\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
    },
  ],
});
