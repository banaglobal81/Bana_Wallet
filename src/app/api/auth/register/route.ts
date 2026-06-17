export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';

export async function POST(req: Request) {
  let body: any = {};
  try { body = await req.json(); } catch {}
  const email = String(body.email ?? '').toLowerCase().trim();
  const password = String(body.password ?? '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ ok: false, error: 'Invalid email' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ ok: false, error: 'Password must be at least 8 characters' }, { status: 400 });
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ ok: false, error: 'Email already registered' }, { status: 409 });
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({ data: { email, passwordHash, role: 'USER' } });
  return NextResponse.json({ ok: true });
}
