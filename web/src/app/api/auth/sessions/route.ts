export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { parseUserAgent, clientIp, geoLookup } from '@/lib/session-device';

// GET /api/auth/sessions — the signed-in user's login sessions ("My Devices").
// Always includes the CURRENT device: if this session predates device-tracking
// (no row for it), we synthesize a "current" entry from the live request so the
// user always sees where they're signed in.
export async function GET(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const sid = session?.sid;
  const rows = await prisma.loginSession.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  const data = rows.map((r) => ({
    id: r.id,
    device: parseUserAgent(r.userAgent),
    ip: r.ip,
    city: r.city,
    country: r.country,
    createdAt: r.createdAt.toISOString(),
    current: r.id === sid,
  }));

  // No tracked row represents this session → show the current device live.
  if (!data.some((d) => d.current)) {
    const ip = clientIp(req.headers);
    const geo = await geoLookup(ip, req.headers.get('cf-ipcountry'));
    data.unshift({
      id: 'current',
      device: parseUserAgent(req.headers.get('user-agent')),
      ip: ip || null,
      city: geo.city,
      country: geo.country,
      createdAt: new Date().toISOString(),
      current: true,
    });
  }

  return NextResponse.json({ ok: true, data });
}
