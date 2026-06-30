export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { niaWalletRequest } from '@/lib/nia/client';
import { requireAdmin } from '@/lib/auth/session';
import { ok, fail } from '@/lib/nia/respond';

export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    await requireAdmin();
    const data = await niaWalletRequest('GET', '/api/v1/settlement/unsettled');
    return ok(data);
  } catch (e) {
    return fail(e as Error & { status?: number; data?: { code?: unknown } });
  }
}
