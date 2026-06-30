export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { niaKlinesFetch } from '@/lib/nia/client';
import { ok, fail } from '@/lib/nia/respond';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  const symbol = sp.get('symbol') ?? '';
  const interval = sp.get('interval') ?? '';
  const limit = sp.get('limit') ?? undefined;
  const endTime = sp.get('endTime') ?? undefined;

  if (!symbol || !interval) {
    return NextResponse.json(
      { ok: false, error: 'symbol and interval are required' },
      { status: 400 },
    );
  }

  try {
    const data = await niaKlinesFetch({ symbol, interval, limit, endTime });
    return ok(data);
  } catch (e) {
    return fail(e as Error & { status?: number; data?: { code?: unknown } });
  }
}
