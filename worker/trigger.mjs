// Railway cron entry — the whole worker.
//
// A one-shot Node script: it calls the web app's staking settlement endpoint
// once, logs the result, and exits. The web app owns all the staking logic; this
// just triggers it. Zero dependencies — Node 18+ global fetch.
//
// The SCHEDULE lives in the Railway dashboard (Settings → Cron Schedule), not in
// this repo — there is no cron expression in any file here.
//
// Required env vars (Railway → Variables):
//   WEB_URL      = https://banawallet.com      (the deployed web app)
//   CRON_SECRET  = <same value as the web app's CRON_SECRET>

const base = (process.env.WEB_URL || '').replace(/\/$/, '');
const secret = process.env.CRON_SECRET;

if (!base) {
  console.error('[staking-cron] WEB_URL is not set — nothing to call. Set it in Railway → Variables.');
  process.exit(1);
}
if (!secret) {
  console.error('[staking-cron] CRON_SECRET is not set — the endpoint would reject us (401/503).');
  process.exit(1);
}

try {
  const res = await fetch(`${base}/api/cron/staking`, {
    method: 'POST',
    headers: { 'x-cron-secret': secret },
  });
  const body = await res.text();
  console.log(`[staking-cron] ${res.status} ${body}`);
  // Non-2xx → exit non-zero so a failed run is visible in Railway's deploy status.
  process.exit(res.ok ? 0 : 1);
} catch (e) {
  console.error('[staking-cron] request failed:', e);
  process.exit(1);
}
