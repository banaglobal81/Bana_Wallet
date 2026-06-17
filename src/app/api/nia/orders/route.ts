export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { niaRequest } from '@/lib/nia/client';
import { resolveSessionUserId } from '@/lib/nia/resolve';
import { ok, fail } from '@/lib/nia/respond';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  try {
    const userId = await resolveSessionUserId();
    const data = await niaRequest('GET', '/api/v1/orders', {
      query: {
        userId,
        symbol: sp.get('symbol') ?? undefined,
        status: sp.get('status') ?? undefined,
      },
    });
    return ok(data);
  } catch (e) {
    return fail(e as Error & { status?: number; data?: { code?: unknown } });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }

  try {
    const userId = await resolveSessionUserId();
    // Inject server-derived userId; strip any client-supplied userId from body.
    const { userId: _dropped, ...clientBody } = body as Record<string, unknown> & { userId?: unknown };
    const data = await niaRequest('POST', '/api/v1/orders', {
      body: { ...clientBody, userId, engineType: 'SPOT' },
    });
    return ok(data);
  } catch (e) {
    return fail(e as Error & { status?: number; data?: { code?: unknown } });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }

  try {
    const userId = await resolveSessionUserId();
    // Inject server-derived userId; strip any client-supplied userId from body.
    const { userId: _dropped, ...clientBody } = body as Record<string, unknown> & { userId?: unknown };
    const data = await niaRequest('DELETE', '/api/v1/orders', {
      body: { ...clientBody, userId, engineType: 'SPOT' },
    });
    return ok(data);
  } catch (e) {
    return fail(e as Error & { status?: number; data?: { code?: unknown } });
  }
}
