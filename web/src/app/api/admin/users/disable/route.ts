export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { recordAudit } from '@/lib/audit';

/**
 * POST /api/admin/users/disable — lock/unlock a user account (ADMIN only).
 * Body: { userId, disabled: boolean }
 * A disabled account cannot sign in (enforced in src/auth.ts). An admin cannot
 * disable their own account (prevents self-lockout).
 */
export async function POST(req: Request): Promise<NextResponse> {
  let me: { id?: string; email?: string };
  try {
    me = (await requireAdmin()) as { id?: string; email?: string };
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  let body: { userId?: unknown; disabled?: unknown } = {};
  try { body = await req.json(); } catch { body = {}; }
  const userId = String(body.userId ?? '');
  const disabled = body.disabled === true;

  if (!userId) {
    return NextResponse.json({ ok: false, error: 'userId is required' }, { status: 400 });
  }
  if (userId === me.id) {
    return NextResponse.json({ ok: false, error: "You can't disable your own account" }, { status: 400 });
  }

  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { disabled },
      select: { id: true, email: true, disabled: true },
    });
    await recordAudit({
      adminId: me.id, adminEmail: me.email,
      action: disabled ? 'USER_DISABLE' : 'USER_ENABLE',
      targetType: 'user', targetId: userId, detail: updated.email,
    });
    return NextResponse.json({ ok: true, data: updated });
  } catch (e) {
    console.error('[admin/users/disable] database error:', e);
    return NextResponse.json(
      { ok: false, error: 'Account service unavailable. Please try again later.' },
      { status: 503 },
    );
  }
}
