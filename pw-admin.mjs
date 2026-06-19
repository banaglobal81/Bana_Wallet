import { chromium } from 'playwright';

const SHOT = '/tmp/admin';
const BASE = 'http://localhost:3100';
const log = (...a) => console.log('[pw]', ...a);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

async function shot(name) {
  await page.screenshot({ path: `${SHOT}/${name}.png`, fullPage: false });
  log('shot', name, '->', page.url());
}

try {
  // 1. Login
  await page.goto(`${BASE}/en/login`, { waitUntil: 'networkidle' });
  await shot('01-login');
  await page.fill('input#email', 'admin@bana.test');
  await page.fill('input#password', 'admin12345');
  await page.click('button[type=submit]');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await shot('02-after-login');
  log('landed on', page.url());

  // 2. Admin settlement page full
  await page.screenshot({ path: `${SHOT}/03-settlement-full.png`, fullPage: true });
  log('settlement full captured');

  // Capture the amber admin top bar - list visible buttons/links
  const topbarInfo = await page.evaluate(() => {
    const txt = [];
    document.querySelectorAll('a,button').forEach(el => {
      const t = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
      if (t) txt.push(`${el.tagName}:${t.slice(0,40)}`);
    });
    return txt;
  });
  log('controls:', JSON.stringify(topbarInfo.slice(0, 40)));

  // 3. Refresh button - find by text/icon
  const refreshBtn = page.locator('button:has-text("Refresh"), button[aria-label*="efresh" i]').first();
  if (await refreshBtn.count()) {
    await refreshBtn.click().catch(e => log('refresh click err', e.message));
    await page.waitForTimeout(1000);
    await shot('04-after-refresh');
  } else {
    log('no explicit Refresh button found; scanning icon buttons');
  }

  // 4. Language globe in admin shell
  const globe = page.locator('button:has-text("EN"), button:has-text("English"), [aria-label*="language" i], [aria-label*="globe" i]').first();
  if (await globe.count()) {
    await globe.click().catch(e => log('globe err', e.message));
    await page.waitForTimeout(600);
    await shot('05-language-open');
  } else { log('language globe not found via selectors'); }

  // 5. Notifications
  const bell = page.locator('[aria-label*="notif" i], button:has(svg.lucide-bell)').first();
  if (await bell.count()) {
    await bell.click().catch(e => log('bell err', e.message));
    await page.waitForTimeout(600);
    await shot('06-notifications');
    await page.keyboard.press('Escape').catch(()=>{});
  } else { log('notifications bell not found'); }

  // 6. Profile menu
  const profile = page.locator('[aria-label*="profile" i], [aria-label*="account" i], button:has(svg.lucide-user)').first();
  if (await profile.count()) {
    await profile.click().catch(e => log('profile err', e.message));
    await page.waitForTimeout(600);
    await shot('07-profile');
    await page.keyboard.press('Escape').catch(()=>{});
  } else { log('profile menu not found'); }

  // 7. Switch admin to another language - go to korean settlement directly
  await page.goto(`${BASE}/ko/admin/settlement`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot('08-settlement-ko');

  // back to en
  await page.goto(`${BASE}/en/admin/settlement`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // 8. Back to Wallet link
  const backWallet = page.locator('a:has-text("Back to Wallet"), a:has-text("Wallet"), button:has-text("Back to Wallet")').first();
  if (await backWallet.count()) {
    await backWallet.click().catch(e => log('backwallet err', e.message));
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);
    await shot('09-back-to-wallet');
    log('back-to-wallet landed', page.url());
  } else { log('Back to Wallet link not found'); }

  // 9. Navigate into a user screen from wallet (e.g. deposit)
  await page.goto(`${BASE}/en/wallet`, { waitUntil: 'networkidle' }).catch(()=>{});
  await page.waitForTimeout(800);
  await shot('10-user-wallet');

  // 10. Try Broker/Tenant dropdown if exists
  await page.goto(`${BASE}/en/admin/settlement`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const selects = await page.locator('select').count();
  log('selects on settlement:', selects);
  const tabs = await page.locator('[role=tab]').count();
  log('tabs:', tabs);

  log('ERRORS:', JSON.stringify(errors, null, 2));
} catch (e) {
  log('FATAL', e.message);
  await shot('99-fatal');
} finally {
  await browser.close();
}
