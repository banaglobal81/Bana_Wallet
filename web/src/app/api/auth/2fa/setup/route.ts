export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { encryptSecret } from '@/lib/crypto';
import { generateTotpSecret, totpKeyUri } from '@/lib/totp';

// POST /api/auth/2fa/setup — begin enrollment: mint a new (pending) secret,
// store it encrypted, and return the secret + otpauth URI for the QR. The secret
// only becomes active once a code is verified via /enable.
export async function POST() {
  const session = await auth();
  const sUser = session?.user as { id?: string; email?: string } | undefined;
  const userId = sUser?.id;
  if (!userId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ ok: false, error: 'Account not found' }, { status: 404 });
  if (user.totpEnabledAt) {
    return NextResponse.json(
      { ok: false, error: 'Two-factor authentication is already enabled. Disable it first to re-enroll.' },
      { status: 400 },
    );
  }

  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: userId },
    data: { totpSecret: encryptSecret(secret), totpEnabledAt: null, totpBackupCodes: [] },
  });

  return NextResponse.json({
    ok: true,
    data: { secret, otpauthUri: totpKeyUri(user.email, secret) },
  });
}
