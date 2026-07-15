export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { NIA_BASE_URL, NIA_BROKER_ID, NIA_DEFAULT_USER_ID, isConfigured } from '@/lib/nia/config';
import { requireUser } from '@/lib/auth/session';

// How long we wait for the hub before calling it unreachable. Kept short: this
// backs a status light, so a slow answer is as good as "down" to the user.
const PING_TIMEOUT_MS = 4000;

/**
 * Is the Nia hub actually reachable right now?
 *
 * Deliberately unauthenticated and unsigned — we only care whether the host
 * answers HTTP at all, not what it says. ANY status code counts as reachable
 * (a 401/404 still proves the hub is up); only a network error, DNS failure or
 * timeout counts as down. Never throws.
 */
async function pingHub(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    await fetch(NIA_BASE_URL, { method: 'HEAD', signal: controller.signal, cache: 'no-store' });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(): Promise<NextResponse> {
  // Gate behind auth — this was previously public and leaked config + an API-key
  // preview to unauthenticated callers. The API-key preview is no longer returned.
  try {
    await requireUser();
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 401 });
  }

  // `configured` = we have credentials; `reachable` = the hub answered just now.
  // Both must be true for the UI to claim we're online.
  const reachable = isConfigured() ? await pingHub() : false;

  return NextResponse.json({
    ok: true,
    configured: isConfigured(),
    reachable,
    baseUrl: NIA_BASE_URL,
    brokerId: NIA_BROKER_ID || null,
    hasDefaultUser: Boolean(NIA_DEFAULT_USER_ID),
    keyPreview: null,
  });
}
