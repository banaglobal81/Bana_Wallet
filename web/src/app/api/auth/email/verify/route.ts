export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { sha256Hex } from '@/lib/crypto';

// POST /api/auth/email/verify — confirm the code and switch the account email.
// On success: block the OLD address from re-registering for 30 days and stamp
// emailChangedAt (24h withdrawal hold enforced in the withdrawal route).
export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  let body: { code?: unknown } = {};
  try { body = await req.json(); } catch { body = {}; }
  const code = String(body.code ?? '').replace(/\D/g, '');

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.pendingEmail || !user.emailChangeCodeHash || !user.emailChangeExpiry) {
    return NextResponse.json({ ok: false, error: 'Start an email change first.' }, { status: 400 });
  }
  if (user.emailChangeExpiry.getTime() < Date.now()) {
    return NextResponse.json({ ok: false, error: 'The code has expired — request a new one.' }, { status: 400 });
  }
  if (sha256Hex(code) !== user.emailChangeCodeHash) {
    return NextResponse.json({ ok: false, error: 'Invalid code. Check your email and try again.' }, { status: 400 });
  }

  // Guard against the new address being claimed between request and verify.
  const taken = await prisma.user.findFirst({ where: { email: user.pendingEmail, NOT: { id: userId } }, select: { id: true } });
  if (taken) {
    return NextResponse.json({ ok: false, error: 'That email is now in use. Try a different address.' }, { status: 400 });
  }

  const now = new Date();
  await prisma.user.update({
    where: { id: userId },
    data: {
      email: user.pendingEmail,
      emailChangedAt: now,
      previousEmail: user.email,
      previousEmailBlockedUntil: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      pendingEmail: null,
      emailChangeCodeHash: null,
      emailChangeExpiry: null,
    },
  });

  return NextResponse.json({ ok: true, data: { email: user.pendingEmail } });
}
