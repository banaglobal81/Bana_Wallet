export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { niaState, WEBHOOK_EVENTS_MAX } from '@/lib/nia/state';
import { resolveSessionUserId } from '@/lib/nia/resolve';
import { fail } from '@/lib/nia/respond';

export async function GET(req: NextRequest): Promise<NextResponse> {
  // -- Identity comes from the session only — never a client-supplied userId. --
  let userId: string;
  try {
    userId = await resolveSessionUserId();
  } catch (e) {
    return fail(e as Error & { status?: number; data?: { code?: unknown } });
  }

  const sp = req.nextUrl.searchParams;
  const rawLimit = sp.has('limit') ? parseInt(sp.get('limit')!, 10) : 50;
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, WEBHOOK_EVENTS_MAX)
      : 50;

  // Show broadcast events (userId === null) plus events owned by this user only.
  const result = niaState.webhookEvents.filter(
    (e) => e.userId === null || e.userId === userId,
  );

  return NextResponse.json({ ok: true, data: result.slice(0, limit) });
}
