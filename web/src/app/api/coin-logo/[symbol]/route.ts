export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { r2Configured, r2Get } from '@/lib/r2';

// A cacheable 404 — most coins have no custom logo, so let the browser cache the
// miss for a few minutes instead of re-hitting the DB on every avatar render.
// Short TTL so a newly-uploaded logo still appears promptly.
const miss = () => new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'public, max-age=300' } });

// GET /api/coin-logo/[symbol] — stream a managed coin's uploaded logo from R2.
// Public (no auth): logos aren't sensitive and are shown across the app.
// 404 when the coin has no custom logo — CoinAvatar then falls back to its initial.
export async function GET(_req: Request, { params }: { params: Promise<{ symbol: string }> }): Promise<NextResponse | Response> {
  const { symbol } = await params;
  const sym = String(symbol || '').replace(/\.[a-z0-9]+$/i, '').toUpperCase();

  if (!r2Configured()) return miss();

  let logoKey: string | null = null;
  try {
    const coin = await prisma.managedCoin.findUnique({ where: { symbol: sym }, select: { logoKey: true } });
    logoKey = coin?.logoKey ?? null;
  } catch {
    return miss();
  }
  if (!logoKey) return miss();

  try {
    const res = await r2Get(logoKey);
    if (!res.ok || !res.body) return miss();
    return new Response(res.body, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return miss();
  }
}
