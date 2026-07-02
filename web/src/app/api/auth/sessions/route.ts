export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { parseUserAgent } from '@/lib/session-device';

// GET /api/auth/sessions — the signed-in user's login sessions ("My Devices").
export async function GET() {
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
    createdAt: r.createdAt,
    current: r.id === sid,
  }));
  return NextResponse.json({ ok: true, data });
}
