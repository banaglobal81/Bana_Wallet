export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

// GET /api/auth/passkeys — the signed-in user's registered passkeys ("My devices").
export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const passkeys = await prisma.passkey.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, deviceName: true, createdAt: true, lastUsedAt: true },
  });
  return NextResponse.json({ ok: true, data: passkeys });
}
