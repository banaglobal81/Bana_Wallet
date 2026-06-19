export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { niaBearerRequest } from '@/lib/nia/client';
import { resolveSessionUserId } from '@/lib/nia/resolve';
import { ok, fail } from '@/lib/nia/respond';

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

  // -- 2. Validate client-supplied currency + network --
  const { currency, network } = body as { currency?: string; network?: string };
  if (!currency || typeof currency !== 'string' || currency.trim() === '') {
    return NextResponse.json({ ok: false, error: 'currency is required' }, { status: 400 });
  }
  if (!network || typeof network !== 'string' || network.trim() === '') {
    return NextResponse.json({ ok: false, error: 'network is required' }, { status: 400 });
  }

  // -- 3. Create/fetch the deposit address via the Bearer-token endpoint --
  try {
    const data = await niaBearerRequest('POST', '/api/v1/address/create-smart-wallet', {
      body: { userId, currency: currency.trim(), network: network.trim() },
    }) as { address?: string; memo?: string } | null;

    // Normalize: always return both fields so the client can store address + memo together.
    return ok({ address: data?.address ?? '', memo: data?.memo ?? '' });
  } catch (e) {
    return fail(e as Error & { status?: number; data?: { code?: unknown } });
  }
}
