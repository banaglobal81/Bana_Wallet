import { test as setup, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getCredentials, login, SPOT_PATH } from './support/riobx';

const STORAGE_STATE = 'e2e/.auth/user.json';

/**
 * Logs in once and persists the authenticated session to disk. The
 * `authenticated` project depends on this, so spot specs start logged in.
 */
setup('authenticate', async ({ page }) => {
  const { email, password } = getCredentials();

  await login(page, email, password);

  // Confirm the session actually reaches the gated spot page (no bounce to login).
  await page.goto(SPOT_PATH, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(new RegExp('/spot/BTC_USDT'));

  mkdirSync(dirname(STORAGE_STATE), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE });
});
