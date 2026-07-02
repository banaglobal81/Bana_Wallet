export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

// GET /api/auth/2fa — current 2FA status for the signed-in user.
export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { totpEnabledAt: true, totpBackupCodes: true },
  });
  return NextResponse.json({
    ok: true,
    data: { enabled: !!user?.totpEnabledAt, backupCodesRemaining: user?.totpBackupCodes.length ?? 0 },
  });
}
