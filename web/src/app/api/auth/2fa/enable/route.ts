export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { decryptSecret } from '@/lib/crypto';
import { verifyTotp, generateBackupCodes } from '@/lib/totp';

// POST /api/auth/2fa/enable — verify the first code against the pending secret,
// then activate 2FA and issue one-time backup codes (returned once, stored hashed).
export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  let body: { code?: unknown } = {};
  try { body = await req.json(); } catch { body = {}; }
  const code = String(body.code ?? '');

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.totpSecret) {
    return NextResponse.json({ ok: false, error: 'Start 2FA setup first.' }, { status: 400 });
  }
  if (user.totpEnabledAt) {
    return NextResponse.json({ ok: false, error: 'Two-factor authentication is already enabled.' }, { status: 400 });
  }

  let secret: string;
  try { secret = decryptSecret(user.totpSecret); }
  catch { return NextResponse.json({ ok: false, error: 'Setup expired — please restart enrollment.' }, { status: 400 }); }

  if (!verifyTotp(code, secret)) {
    return NextResponse.json({ ok: false, error: 'Invalid code. Check your authenticator app and try again.' }, { status: 400 });
  }

  const { plain, hashed } = generateBackupCodes(10);
  await prisma.user.update({
    where: { id: userId },
    data: { totpEnabledAt: new Date(), totpBackupCodes: hashed },
  });

  return NextResponse.json({ ok: true, data: { backupCodes: plain } });
}
