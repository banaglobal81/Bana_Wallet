export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { r2Configured, r2Get } from '@/lib/r2';

// Only these top-level prefixes are servable (logos) — never expose arbitrary keys.
const ALLOWED_PREFIXES = ['coins/', 'brand/'];

const CT: Record<string, string> = {
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
};

// GET /api/r2/<key...> — public image proxy that streams a logo from R2.
// e.g. /api/r2/coins/usdt.svg  or  /api/r2/brand/bana_wordmark.png
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }): Promise<NextResponse | Response> {
  const { key } = await params;
  const path = (key || []).join('/');

  if (!path || path.includes('..') || !ALLOWED_PREFIXES.some((p) => path.startsWith(p))) {
    return new NextResponse(null, { status: 404 });
  }
  if (!r2Configured()) return new NextResponse(null, { status: 404 });

  try {
    const res = await r2Get(path);
    if (!res.ok || !res.body) return new NextResponse(null, { status: 404 });
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    return new Response(res.body, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('Content-Type') || CT[ext] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
