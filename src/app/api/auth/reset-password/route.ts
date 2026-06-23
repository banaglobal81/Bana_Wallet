export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';

export async function POST(req: Request) {
  let body: { token?: unknown; password?: unknown } = {};
  try { body = await req.json(); } catch { body = {}; }
  const token = String(body.token ?? '');
  const password = String(body.password ?? '');

  if (!token) {
    return NextResponse.json({ ok: false, error: 'Invalid or expired reset link' }, { status: 400 });
  }
  // Same password policy as registration / change-password.
  if (password.length < 8) {
    return NextResponse.json({ ok: false, error: 'Password must be at least 8 characters' }, { status: 400 });
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    return NextResponse.json({ ok: false, error: 'Password must be at most 72 bytes' }, { status: 400 });
  }

  // Look up by the token's hash — the raw token is never stored.
  const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
  try {
    const user = await prisma.user.findFirst({ where: { resetTokenHash } });
    if (!user || !user.resetTokenExpiry || user.resetTokenExpiry.getTime() < Date.now()) {
      return NextResponse.json({ ok: false, error: 'Invalid or expired reset link' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    // Set new password and consume the token (single-use) in one update.
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetTokenHash: null, resetTokenExpiry: null },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[reset-password] database error:', e);
    return NextResponse.json(
      { ok: false, error: 'Account service unavailable. Please try again later.' },
      { status: 503 },
    );
  }
}
