import 'server-only';

import { NextResponse } from 'next/server';

interface NiaError extends Error {
  status?: number;
  data?: { code?: unknown };
}

/**
 * Successful response envelope: { ok: true, data }.
 */
export function ok(data: unknown): NextResponse {
  return NextResponse.json({ ok: true, data });
}

/**
 * Error response envelope: { ok: false, error, code? }.
 * [SECURITY] Never leaks raw upstream e.data — only whitelists the error code.
 */
export function fail(e: NiaError): NextResponse {
  const body: { ok: boolean; error: string; code?: unknown } = {
    ok: false,
    error: e.message,
  };
  if (e.data?.code !== undefined) {
    body.code = e.data.code;
  }
  return NextResponse.json(body, { status: e.status ?? 500 });
}
