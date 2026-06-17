export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { niaState, WEBHOOK_EVENTS_MAX } from '@/lib/nia/state';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  const filterUserId = sp.get('userId') ?? null;
  const rawLimit = sp.has('limit') ? parseInt(sp.get('limit')!, 10) : 50;
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, WEBHOOK_EVENTS_MAX)
      : 50;

  let result = niaState.webhookEvents;
  if (filterUserId) {
    result = niaState.webhookEvents.filter(
      (e) => e.userId === null || e.userId === filterUserId,
    );
  }

  return NextResponse.json({ ok: true, data: result.slice(0, limit) });
}
