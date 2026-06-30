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
    const data = await niaRequest('GET', '/api/v1/trades', {
      query: {
        userId,
        symbol: sp.get('symbol') ?? undefined,
        orderId: sp.get('orderId') ?? undefined,
      },
    });
    return ok(data);
  } catch (e) {
    return fail(e as Error & { status?: number; data?: { code?: unknown } });
  }
}
