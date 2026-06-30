export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { NIA_WEBHOOK_SECRET } from '@/lib/nia/config';
import { niaState, WEBHOOK_EVENTS_MAX } from '@/lib/nia/state';

export async function POST(req: NextRequest): Promise<NextResponse> {
  // -- Optional shared-secret verification (timing-safe) --
  if (NIA_WEBHOOK_SECRET) {
    const provided = req.headers.get('X-Nia-Webhook-Secret') ?? '';
    // [SECURITY] Use constant-time comparison to prevent timing-oracle attacks.
    // Guard against length mismatch: if lengths differ, reject without throwing.
    const expectedBuf = Buffer.from(NIA_WEBHOOK_SECRET, 'utf8');
    const providedBuf = Buffer.from(provided, 'utf8');
    const valid =
      expectedBuf.length === providedBuf.length &&
      crypto.timingSafeEqual(expectedBuf, providedBuf);
    if (!valid) {
      return NextResponse.json({ ok: false, error: 'Invalid webhook secret' }, { status: 401 });
    }
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }

  // Normalize and store the event — defensive against unknown body shapes.
  const evt = {
    id: ++niaState.webhookEventSeq,
    ts: Date.now(),
    type: (body?.event ?? body?.type ?? 'event') as string,
    userId: ((body?.data as Record<string, unknown> | undefined)?.userId ?? body?.userId ?? null) as string | null,
    data: body,
  };

  niaState.webhookEvents.unshift(evt);
  if (niaState.webhookEvents.length > WEBHOOK_EVENTS_MAX) {
    niaState.webhookEvents.length = WEBHOOK_EVENTS_MAX;
  }

  return NextResponse.json({ ok: true });
}
