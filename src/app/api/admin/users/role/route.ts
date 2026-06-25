export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { recordAudit } from '@/lib/audit';

/**
 * POST /api/admin/users/role — change a user's role (ADMIN only).
 * Body: { userId, role: 'USER' | 'ADMIN' }
 * Safeguards: an admin cannot change their own role, and the last remaining
 * ADMIN cannot be demoted (prevents locking everyone out of the admin area).
 */
export async function POST(req: Request): Promise<NextResponse> {
  let me: { id?: string; email?: string };
  try {
    me = (await requireAdmin()) as { id?: string; email?: string };
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  let body: { userId?: unknown; role?: unknown } = {};
  try { body = await req.json(); } catch { body = {}; }
  const userId = String(body.userId ?? '');
  const role = String(body.role ?? '');

  if (!userId) {
    return NextResponse.json({ ok: false, error: 'userId is required' }, { status: 400 });
  }
  if (role !== 'USER' && role !== 'ADMIN') {
    return NextResponse.json({ ok: false, error: 'role must be USER or ADMIN' }, { status: 400 });
  }
  if (userId === me.id) {
    return NextResponse.json({ ok: false, error: "You can't change your own role" }, { status: 400 });
  }

  try {
    // Block demoting the last admin.
    if (role === 'USER') {
      const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
      if (!target) return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 });
      if (target.role === 'ADMIN') {
        const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
        if (adminCount <= 1) {
          return NextResponse.json(
            { ok: false, error: 'Cannot demote the last remaining admin' },
            { status: 400 },
          );
        }
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role: role as 'USER' | 'ADMIN' },
      select: { id: true, email: true, role: true },
    });
    await recordAudit({
      adminId: me.id, adminEmail: me.email, action: 'USER_ROLE_CHANGE',
      targetType: 'user', targetId: userId, detail: `${updated.email} → ${role}`,
    });
    return NextResponse.json({ ok: true, data: updated });
  } catch (e) {
    console.error('[admin/users/role] database error:', e);
    return NextResponse.json(
      { ok: false, error: 'Account service unavailable. Please try again later.' },
      { status: 503 },
    );
  }
}
