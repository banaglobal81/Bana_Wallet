export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { NIA_API_KEY, NIA_BASE_URL, NIA_BROKER_ID, NIA_DEFAULT_USER_ID, isConfigured } from '@/lib/nia/config';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    ok: true,
    configured: isConfigured(),
    baseUrl: NIA_BASE_URL,
    brokerId: NIA_BROKER_ID || null,
    hasDefaultUser: Boolean(NIA_DEFAULT_USER_ID),
    keyPreview: NIA_API_KEY
      ? `${NIA_API_KEY.slice(0, 4)}••••${NIA_API_KEY.slice(-4)}`
      : null,
  });
}
