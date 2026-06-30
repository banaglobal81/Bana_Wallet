export const runtime = 'nodejs';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { requireAdmin } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { recordAudit } from '@/lib/audit';

/**
 * POST /api/admin/users/reset-link — generate a password-reset link for a user (ADMIN only).
 * Body: { userId }
 * Reuses the same token system as "Forgot password" (hash stored, 30-min expiry,
 * single-use). Returns a one-time link the admin can hand to the user — useful when
 * email isn't configured. Only works for password accounts (Google accounts have none).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let me: { id?: string; email?: string };
  try {
    me = (await requireAdmin()) as { id?: string; email?: string };
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  let body: { userId?: unknown } = {};
  try { body = await req.json(); } catch { body = {}; }
  const userId = String(body.userId ?? '');
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'userId is required' }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!user) {
      return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 });
    }
    if (!user.passwordHash) {
      return NextResponse.json(
        { ok: false, error: 'This account signs in with Google — it has no password to reset.' },
        { status: 400 },
      );
    }

    const token = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const resetTokenExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    await prisma.user.update({ where: { id: userId }, data: { resetTokenHash, resetTokenExpiry } });
    await recordAudit({
      adminId: me.id, adminEmail: me.email, action: 'USER_RESET_LINK',
      targetType: 'user', targetId: userId,
    });

    const origin = process.env.APP_URL?.replace(/\/$/, '') || req.nextUrl.origin;
    const link = `${origin}/reset-password?token=${encodeURIComponent(token)}`;
    return NextResponse.json({ ok: true, data: { link, expiresInMinutes: 30 } });
  } catch (e) {
    console.error('[admin/users/reset-link] database error:', e);
    return NextResponse.json(
      { ok: false, error: 'Account service unavailable. Please try again later.' },
      { status: 503 },
    );
  }
}
