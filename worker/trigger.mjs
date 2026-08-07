// Persistent worker entry point.
//
// Runs forever as a normal long-lived process (no Railway Cron Schedule
// involved). Each cycle it:
//   1. GETs the current schedule from the web app (admin-configurable, via
//      Admin → Settings), so a schedule change there takes effect on the
//      next cycle without a redeploy.
//   2. If enabled, POSTs the settlement trigger.
//   3. Sleeps until the next run per the schedule (interval or daily-at-time).
//
// A failed request (network blip, web app mid-deploy, etc.) is logged and
// the loop just continues to the next cycle — it never exits because of a
// bad run. The web app owns all the staking logic; this only triggers it.
// Zero dependencies — Node 18+ global fetch.
//
// Required env vars (Railway → Variables):
//   WEB_URL      = https://banawallet.com      (the deployed web app)
//   CRON_SECRET  = <same value as the web app's CRON_SECRET>

const base = (process.env.WEB_URL || '').replace(/\/$/, '');
const secret = process.env.CRON_SECRET;

if (!base) {
  console.error('[staking-worker] WEB_URL is not set — nothing to call. Set it in Railway → Variables.');
  process.exit(1);
}
if (!secret) {
  console.error('[staking-worker] CRON_SECRET is not set — the endpoint would reject us (401/503).');
  process.exit(1);
}

const FALLBACK_SCHEDULE = { enabled: true, mode: 'INTERVAL', intervalMinutes: 5, dailyTime: '00:00' };
let schedule = FALLBACK_SCHEDULE;
let running = true;

process.on('SIGTERM', () => {
  console.log('[staking-worker] SIGTERM received, exiting.');
  running = false;
  process.exit(0);
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Milliseconds from now until the next occurrence of "HH:mm" UTC.
function msUntilDaily(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m, 0, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

async function fetchSchedule() {
  const res = await fetch(`${base}/api/cron/staking`, {
    method: 'GET',
    headers: { 'x-cron-secret': secret },
  });
  if (!res.ok) throw new Error(`config fetch ${res.status}`);
  const body = await res.json();
  if (!body?.data?.schedule) throw new Error('config fetch: no schedule in response');
  return body.data.schedule;
}

async function triggerSettlement() {
  const res = await fetch(`${base}/api/cron/staking`, {
    method: 'POST',
    headers: { 'x-cron-secret': secret },
  });
  const text = await res.text();
  console.log(`[staking-worker] ${res.status} ${text}`);
}

while (running) {
  try {
    schedule = await fetchSchedule();
  } catch (e) {
    console.error('[staking-worker] failed to fetch schedule, using last-known config:', e.message);
  }

  if (schedule.enabled) {
    try {
      await triggerSettlement();
    } catch (e) {
      console.error('[staking-worker] settlement request failed, will retry next cycle:', e.message);
    }
  } else {
    console.log('[staking-worker] disabled via admin settings, skipping this cycle.');
  }

  const waitMs = schedule.mode === 'DAILY'
    ? msUntilDaily(schedule.dailyTime)
    : Math.max(1, schedule.intervalMinutes) * 60_000;
  await sleep(waitMs);
}
