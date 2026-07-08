export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { niaState } from '@/lib/nia/state';

/**
 * GET /api/admin/deposits-feed — recent platform deposits (ADMIN only).
 *
 * The hub has no platform-wide "all deposits" endpoint, so this is a BEST-EFFORT
 * feed built from inbound webhook events (in-memory). It only has data if deposit
 * webhooks are configured on the hub; otherwise it's empty (the UI says so).
 */
export async function GET(): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  // webhookEvents is maintained newest-first (unshift), so take the FIRST 20 to
  // get the most-recent deposits. (A previous slice(-20).reverse() took the
  // OLDEST 20 once the buffer held more than 20 deposit events.)
  const events = (niaState.webhookEvents ?? [])
    .filter((e) => /deposit|received|credit/i.test(e.type))
    .slice(0, 20)
    .map((e) => {
      const d = (e.data ?? {}) as Record<string, unknown>;
      return {
        id: e.id,
        ts: e.ts,
        userId: e.userId,
        amount: (d.amount as string) ?? null,
        currency: (d.currency as string) ?? null,
        network: (d.network as string) ?? null,
        status: (d.status as string) ?? null,
      };
    });

  return NextResponse.json({ ok: true, data: events });
}
