export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { decryptSecret } from '@/lib/crypto';
import { verifyTotp, matchBackupCode } from '@/lib/totp';

// POST /api/auth/2fa/disable — turn off 2FA. Requires a valid current code OR a
// backup code (proves possession), then clears the secret + backup codes.
export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  let body: { code?: unknown } = {};
  try { body = await req.json(); } catch { body = {}; }
  const code = String(body.code ?? '');

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.totpEnabledAt || !user.totpSecret) {
    return NextResponse.json({ ok: false, error: 'Two-factor authentication is not enabled.' }, { status: 400 });
  }

  let ok = false;
  try { ok = verifyTotp(code, decryptSecret(user.totpSecret)); } catch { ok = false; }
  if (!ok && matchBackupCode(code, user.totpBackupCodes)) ok = true;
  if (!ok) {
    return NextResponse.json({ ok: false, error: 'Invalid code — enter a current 6-digit code or a backup code.' }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { totpSecret: null, totpEnabledAt: null, totpBackupCodes: [] },
  });
  return NextResponse.json({ ok: true });
}
