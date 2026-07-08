export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { sha256Hex } from '@/lib/crypto';
import { sendEmailChangeCode } from '@/lib/email/resend';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// POST /api/auth/email/request — start an email change: validate the new address,
// mint a 6-digit code (hashed, 15-min expiry), and send it to the NEW address.
export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  let body: { newEmail?: unknown; currentPassword?: unknown } = {};
  try { body = await req.json(); } catch { body = {}; }
  const newEmail = String(body.newEmail ?? '').toLowerCase().trim();
  const currentPassword = String(body.currentPassword ?? '');

  if (!EMAIL_RE.test(newEmail)) {
    return NextResponse.json({ ok: false, error: 'Enter a valid email address.' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ ok: false, error: 'Account not found' }, { status: 404 });
  // Google-login accounts: the email is their Google identity — changing it here
  // would break sign-in. Managed on Google's side only.
  if (!user.passwordHash) {
    return NextResponse.json(
      { ok: false, error: 'This account signs in with Google — its email is managed by Google and can’t be changed here.' },
      { status: 400 },
    );
  }
  // RE-AUTHENTICATE: changing the email is an account-takeover pivot (change email
  // → password reset), so require the current password — a stolen session alone
  // must not be able to do it.
  if (!currentPassword || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return NextResponse.json({ ok: false, error: 'Incorrect password.' }, { status: 403 });
  }
  if (newEmail === user.email) {
    return NextResponse.json({ ok: false, error: 'That is already your email address.' }, { status: 400 });
  }
  const taken = await prisma.user.findUnique({ where: { email: newEmail }, select: { id: true } });
  if (taken) {
    return NextResponse.json({ ok: false, error: 'That email is already in use.' }, { status: 400 });
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  await prisma.user.update({
    where: { id: userId },
    data: {
      pendingEmail: newEmail,
      emailChangeCodeHash: sha256Hex(code),
      emailChangeExpiry: new Date(Date.now() + 15 * 60 * 1000),
    },
  });

  try {
    await sendEmailChangeCode(newEmail, code);
  } catch (e) {
    console.error('[email-change] send failed:', e);
    return NextResponse.json(
      { ok: false, error: 'Could not send the verification email. Please try again later.' },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
