export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { niaWalletRequest } from '@/lib/nia/client';
import { resolveUserId } from '@/lib/nia/resolve';
import { niaState } from '@/lib/nia/state';
import { ok, fail } from '@/lib/nia/respond';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  try {
    const data = await niaWalletRequest('GET', '/api/v1/withdrawals', {
      query: {
        userId: resolveUserId(sp),
        currency: sp.get('currency') ?? undefined,
        page: sp.get('page') ?? undefined,
        limit: sp.get('limit') ?? undefined,
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

  // -- 1. Explicit userId required — no NIA_DEFAULT_USER_ID fallback for withdrawals --
  const userId = (sp.get('userId') || body?.userId) as string | undefined;
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: 'userId is required for withdrawals' },
      { status: 400 },
    );
  }

  const { currency, network, toAddress, amount } = body as {
    currency?: string;
    network?: string;
    toAddress?: string;
    amount?: unknown;
  };

  // -- 2. Validate toAddress --
  if (!toAddress || typeof toAddress !== 'string' || toAddress.trim() === '') {
    return NextResponse.json(
      { ok: false, error: 'toAddress is required' },
      { status: 400 },
    );
  }

  // -- 3. Validate amount with decimal.js (never Number/parseFloat for money) --
  let decAmount: Decimal;
  try {
    decAmount = new Decimal(amount as string | number);
    if (!decAmount.isFinite() || !decAmount.gt(0)) throw new Error('out-of-range');
  } catch {
    return NextResponse.json(
      { ok: false, error: 'amount must be a finite positive number' },
      { status: 400 },
    );
  }

  // -- 4. In-flight dedup guard --
  // Prefer client-supplied Idempotency-Key; fall back to stable tuple.
  const clientKey = req.headers.get('Idempotency-Key');
  const inflightKey = clientKey
    ? `idem:${clientKey}`
    : `${userId}|${currency}|${network}|${toAddress.trim()}|${decAmount.toFixed()}`;

  if (niaState.inFlightWithdrawals.has(inflightKey)) {
    return NextResponse.json(
      { ok: false, error: 'A duplicate withdrawal is already in progress' },
      { status: 409 },
    );
  }

  niaState.inFlightWithdrawals.add(inflightKey);
  try {
    // Build the upstream body. Keep amount as string — never convert to Number.
    const upstreamBody: Record<string, unknown> = {
      userId,
      currency,
      network,
      amount: decAmount.toFixed(), // canonical string, no float drift
      toAddress: toAddress.trim(),
    };
    // Forward client idempotency key to Nia-Hub if supplied.
    if (clientKey) upstreamBody.idempotencyKey = clientKey;

    const data = await niaWalletRequest('POST', '/api/v1/withdrawals', { body: upstreamBody });
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    const err = e as Error & { status?: number; data?: { code?: unknown } };
    const safeCode = err.data?.code;
    const respBody: { ok: boolean; error: string; code?: unknown } = {
      ok: false,
      error: err.message,
    };
    if (safeCode !== undefined) respBody.code = safeCode;
    return NextResponse.json(respBody, { status: err.status ?? 500 });
  } finally {
    // Always release the in-flight key so retries are possible after resolution.
    niaState.inFlightWithdrawals.delete(inflightKey);
  }
}
