import { type Page } from '@playwright/test';

export const SPOT_PATH = '/en/spot/BTC_USDT';
export const LOGIN_PATH = '/en/auth/login';

/** Read required creds, failing with a clear message if missing. */
export function getCredentials() {
  const email = process.env.RIOBX_EMAIL;
  const password = process.env.RIOBX_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'Missing RIOBX_EMAIL / RIOBX_PASSWORD. Set them in your environment ' +
        '(e.g. an untracked .env.e2e) before running the authenticated suite.',
    );
  }
  return { email, password };
}

/**
 * Drive the Riobx login form. Selectors are role/placeholder based because
 * the form fields use dynamic React ids (e.g. `textinput-_r_0_`).
 */
export async function login(page: Page, email: string, password: string) {
  await page.goto(LOGIN_PATH, { waitUntil: 'domcontentloaded' });

  await page.getByPlaceholder('Enter ID or Email').fill(email);
  await page.getByPlaceholder('Enter Password').fill(password);
  await page.getByRole('button', { name: 'Log In', exact: true }).click();

  // Race the success signal (navigation away from login) against riobx's own
  // "Login Failed" message so bad creds fail fast with a clear reason.
  const failure = page.getByText(/incorrect|Login Failed/i).first();
  const left = page
    .waitForURL((url) => !url.pathname.includes('/auth/login'), { timeout: 20_000 })
    .then(() => 'ok' as const);
  const failed = failure
    .waitFor({ state: 'visible', timeout: 20_000 })
    .then(() => 'fail' as const);

  const outcome = await Promise.race([left, failed]).catch(() => 'timeout' as const);
  if (outcome !== 'ok') {
    const msg = await failure.textContent().catch(() => null);
    throw new Error(
      `Login did not succeed for "${email}". ` +
        (msg ? `Site says: "${msg.trim()}". ` : '') +
        'Check RIOBX_EMAIL / RIOBX_PASSWORD in .env.e2e.',
    );
  }
}
