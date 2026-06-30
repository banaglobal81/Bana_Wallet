export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { niaBearerRequest } from '@/lib/nia/client';
import { resolveSessionUserId } from '@/lib/nia/resolve';
import { niaState } from '@/lib/nia/state';
import { ok, fail } from '@/lib/nia/respond';

// Asset/network codes are short alphanumeric tickers (e.g. USDC, ETH, TRX, BASE).
// Enforce a strict shape server-side so arbitrary strings never reach the hub —
// the UI already constrains choices to the markets list; this closes the direct-API gap.
const CODE_RE = /^[A-Za-z0-9]{1,16}$/;

/**
 * POST /api/nia/address — create (or fetch, idempotently) a deposit address.
 *
 * Auth: Bearer-token S2S call to Nia-Hub's /api/v1/address/create-smart-wallet.
 * userId is ALWAYS derived from the session — never trusted from the client.
 * The client only supplies currency + network.
 *
 * Returns { address, memo }. The hub endpoint is idempotent (same userId+currency
 * returns the same address), so this is safe to call on every deposit-screen load.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }

  // -- 1. Derive userId exclusively from the session --
  let userId: string;
  try {
    userId = await resolveSessionUserId();
  } catch (e) {
    return fail(e as Error & { status?: number; data?: { code?: unknown } });
  }

  // -- 2. Validate client-supplied currency + network (strict allow-list shape) --
  const currency = typeof body.currency === 'string' ? body.currency.trim() : '';
  const network = typeof body.network === 'string' ? body.network.trim() : '';
  if (!CODE_RE.test(currency)) {
    return NextResponse.json({ ok: false, error: 'currency is required' }, { status: 400 });
  }
  if (!CODE_RE.test(network)) {
    return NextResponse.json({ ok: false, error: 'network is required' }, { status: 400 });
  }

  // -- 3. In-flight guard: collapse concurrent duplicate creates for the same
  //       (user, currency, network) so rapid asset/network toggling can't fan out
  //       redundant S2S calls to the hub. The upstream is idempotent, so a duplicate
  //       isn't dangerous — this just avoids wasted concurrent requests. --
  const key = `${userId}|${currency}|${network}`;
  if (niaState.inFlightAddresses.has(key)) {
    return NextResponse.json(
      { ok: false, error: 'Address request already in progress' },
      { status: 409 },
    );
  }
  niaState.inFlightAddresses.add(key);

  // -- 4. Create/fetch the deposit address via the Bearer-token endpoint --
  try {
    const data = await niaBearerRequest('POST', '/api/v1/address/create-smart-wallet', {
      body: { userId, currency, network },
    }) as { address?: string; memo?: string } | null;

    // Normalize: always return both fields so the client can store address + memo together.
    return ok({ address: data?.address ?? '', memo: data?.memo ?? '' });
  } catch (e) {
    return fail(e as Error & { status?: number; data?: { code?: unknown } });
  } finally {
    niaState.inFlightAddresses.delete(key);
  }
}
