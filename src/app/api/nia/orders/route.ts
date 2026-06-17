export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { niaRequest } from '@/lib/nia/client';
import { resolveUserId } from '@/lib/nia/resolve';
import { ok, fail } from '@/lib/nia/respond';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  try {
    const data = await niaRequest('GET', '/api/v1/orders', {
      query: {
        userId: resolveUserId(sp),
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
  const sp = req.nextUrl.searchParams;
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }

  try {
    const data = await niaRequest('POST', '/api/v1/orders', {
      body: { ...body, userId: resolveUserId(sp, body), engineType: 'SPOT' },
    });
    return ok(data);
  } catch (e) {
    return fail(e as Error & { status?: number; data?: { code?: unknown } });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }

  try {
    const data = await niaRequest('DELETE', '/api/v1/orders', {
      body: { ...body, userId: resolveUserId(sp, body), engineType: 'SPOT' },
    });
    return ok(data);
  } catch (e) {
    return fail(e as Error & { status?: number; data?: { code?: unknown } });
  }
}
