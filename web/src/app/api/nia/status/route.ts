export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { NIA_BASE_URL, NIA_BROKER_ID, NIA_DEFAULT_USER_ID, isConfigured } from '@/lib/nia/config';
import { requireUser } from '@/lib/auth/session';

export async function GET(): Promise<NextResponse> {
  // Gate behind auth — this was previously public and leaked config + an API-key
  // preview to unauthenticated callers. The API-key preview is no longer returned.
  try {
    await requireUser();
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 401 });
  }
  return NextResponse.json({
    ok: true,
    configured: isConfigured(),
    baseUrl: NIA_BASE_URL,
    brokerId: NIA_BROKER_ID || null,
    hasDefaultUser: Boolean(NIA_DEFAULT_USER_ID),
    keyPreview: null,
  });
}
