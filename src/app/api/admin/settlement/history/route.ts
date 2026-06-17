export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { niaWalletRequest } from '@/lib/nia/client';
import { ok, fail } from '@/lib/nia/respond';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  try {
    const data = await niaWalletRequest('GET', '/api/v1/settlement/history', {
      query: {
        startTime: sp.get('startTime') ?? undefined,
        endTime: sp.get('endTime') ?? undefined,
        page: sp.get('page') ?? undefined,
        limit: sp.get('limit') ?? undefined,
      },
    });
    return ok(data);
  } catch (e) {
    return fail(e as Error & { status?: number; data?: { code?: unknown } });
  }
}
