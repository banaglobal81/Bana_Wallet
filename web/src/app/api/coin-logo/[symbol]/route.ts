export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { r2Configured, r2Get } from '@/lib/r2';

// GET /api/coin-logo/[symbol] — stream a managed coin's uploaded logo from R2.
// Public (no auth): logos aren't sensitive and are shown across the app.
// 404 when the coin has no custom logo — CoinAvatar then falls back to its initial.
export async function GET(_req: Request, { params }: { params: Promise<{ symbol: string }> }): Promise<NextResponse | Response> {
  const { symbol } = await params;
  const sym = String(symbol || '').replace(/\.[a-z0-9]+$/i, '').toUpperCase();

  if (!r2Configured()) return new NextResponse(null, { status: 404 });

  let logoKey: string | null = null;
  try {
    const coin = await prisma.managedCoin.findUnique({ where: { symbol: sym }, select: { logoKey: true } });
    logoKey = coin?.logoKey ?? null;
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  if (!logoKey) return new NextResponse(null, { status: 404 });

  try {
    const res = await r2Get(logoKey);
    if (!res.ok || !res.body) return new NextResponse(null, { status: 404 });
    return new Response(res.body, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
