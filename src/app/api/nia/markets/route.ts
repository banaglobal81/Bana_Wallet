export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { niaRequest } from '@/lib/nia/client';
import { ok, fail } from '@/lib/nia/respond';

export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const data = await niaRequest('GET', '/api/v1/markets');
    return ok(data);
  } catch (e) {
    return fail(e as Error & { status?: number; data?: { code?: unknown } });
  }
}
