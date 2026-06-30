export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: { currentPassword?: unknown; newPassword?: unknown } = {};
  try { body = await req.json(); } catch { body = {}; }
  const currentPassword = String(body.currentPassword ?? '');
  const newPassword = String(body.newPassword ?? '');

  // Same policy as registration: min 8 chars, max 72 bytes (bcrypt truncation point).
  if (newPassword.length < 8) {
    return NextResponse.json({ ok: false, error: 'New password must be at least 8 characters' }, { status: 400 });
  }
  if (Buffer.byteLength(newPassword, 'utf8') > 72) {
    return NextResponse.json({ ok: false, error: 'New password must be at most 72 bytes' }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Account not found' }, { status: 404 });
    }
    // Google-only accounts have no password to verify against.
    if (!user.passwordHash) {
      return NextResponse.json(
        { ok: false, error: 'This account signs in with Google; there is no password to change.' },
        { status: 400 },
      );
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ ok: false, error: 'Current password is incorrect' }, { status: 400 });
    }
    // Reject a no-op change so users don't think they rotated when they didn't.
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      return NextResponse.json({ ok: false, error: 'New password must be different from the current one' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[change-password] database error:', e);
    return NextResponse.json(
      { ok: false, error: 'Account service unavailable. Please try again later.' },
      { status: 503 },
    );
  }
}
