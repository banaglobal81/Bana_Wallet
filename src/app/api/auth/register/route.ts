export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { newNiaUserId } from '@/lib/nia/identity';

export async function POST(req: Request) {
  let body: any = {};
  try { body = await req.json(); } catch {}
  const email = String(body.email ?? '').toLowerCase().trim();
  const password = String(body.password ?? '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ ok: false, error: 'Invalid email' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ ok: false, error: 'Password must be at least 8 characters' }, { status: 400 });
  // bcrypt silently truncates input beyond 72 bytes — reject longer passwords so the
  // user's full input is what actually protects the account (no surprise truncation).
  if (Buffer.byteLength(password, 'utf8') > 72) return NextResponse.json({ ok: false, error: 'Password must be at most 72 bytes' }, { status: 400 });
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ ok: false, error: 'Email already registered' }, { status: 409 });
    const passwordHash = await bcrypt.hash(password, 12);
    // Mint a dedicated Nia-Hub end-user id so this account maps to its own
    // Nia sub-account rather than sharing NIA_DEFAULT_USER_ID.
    await prisma.user.create({ data: { email, passwordHash, role: 'USER', niaUserId: newNiaUserId() } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    // P2002 = unique constraint race (two signups, same email)
    if ((e as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ ok: false, error: 'Email already registered' }, { status: 409 });
    }
    // Most likely the database isn't reachable / not migrated. Log server-side,
    // return a clear message instead of a blank 500.
    console.error('[register] database error:', e);
    return NextResponse.json(
      { ok: false, error: 'Account service unavailable. Please try again later.' },
      { status: 503 },
    );
  }
}
