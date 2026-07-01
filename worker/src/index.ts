/**
 * BANA staking worker — Cloudflare Worker (Cron Trigger).
 *
 * Runs on a schedule (see wrangler.toml crons) and triggers the daily staking
 * interest accrual on the web app. It does NOT touch the database directly — it
 * calls a secret-protected endpoint on the web app, which owns the DB + accrual
 * logic. Keeping the logic in one place avoids duplicating Prisma/DB setup here.
 */
export interface Env {
  /** Base URL of the deployed web app, e.g. https://bana.up.railway.app */
  WEB_URL: string;
  /** Shared secret — must match the web app's CRON_SECRET. Set via `wrangler secret put CRON_SECRET`. */
  CRON_SECRET: string;
}

async function runAccrual(env: Env): Promise<{ status: number; body: string }> {
  const res = await fetch(`${env.WEB_URL.replace(/\/$/, '')}/api/cron/staking`, {
    method: 'POST',
    headers: { 'x-cron-secret': env.CRON_SECRET },
  });
  const body = await res.text();
  return { status: res.status, body };
}

export default {
  // Fired by the cron schedule.
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runAccrual(env).then(({ status, body }) => {
        console.log(`[staking-cron] ${status} ${body}`);
      }).catch((e) => {
        console.error('[staking-cron] failed', e);
      }),
    );
  },

  // Optional manual trigger / health check: GET the worker URL to run accrual once.
  async fetch(_req: Request, env: Env): Promise<Response> {
    const { status, body } = await runAccrual(env);
    return new Response(`staking-cron → ${status} ${body}`, { status: 200 });
  },
};
