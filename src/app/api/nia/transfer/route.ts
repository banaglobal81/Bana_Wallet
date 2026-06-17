export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { niaWalletRequest } from '@/lib/nia/client';
import { resolveUserId } from '@/lib/nia/resolve';
import { ok, fail } from '@/lib/nia/respond';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }

  try {
    const data = await niaWalletRequest('POST', '/api/v1/wallets/transfer', {
      body: {
        userId: resolveUserId(sp, body),
        currency: body.currency,
        fromType: body.fromType,
        toType: body.toType,
        amount: body.amount,
      },
    });
    return ok(data);
  } catch (e) {
    return fail(e as Error & { status?: number; data?: { code?: unknown } });
  }
}
