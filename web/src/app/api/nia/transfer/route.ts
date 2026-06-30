export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { niaWalletRequest } from '@/lib/nia/client';
import { resolveSessionUserId } from '@/lib/nia/resolve';
import { ok, fail } from '@/lib/nia/respond';

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }

  // -- Validate amount with decimal.js (never Number/parseFloat for money) --
  let decAmount: Decimal;
  try {
    decAmount = new Decimal(body.amount as string | number);
    if (!decAmount.isFinite() || !decAmount.gt(0)) throw new Error('out-of-range');
  } catch {
    return NextResponse.json(
      { ok: false, error: 'amount must be a finite positive number' },
      { status: 400 },
    );
  }

  try {
    const userId = await resolveSessionUserId();
    const data = await niaWalletRequest('POST', '/api/v1/wallets/transfer', {
      body: {
        userId,
        currency: body.currency,
        fromType: body.fromType,
        toType: body.toType,
        amount: decAmount.toFixed(), // canonical string, no float drift
      },
    });
    return ok(data);
  } catch (e) {
    return fail(e as Error & { status?: number; data?: { code?: unknown } });
  }
}
