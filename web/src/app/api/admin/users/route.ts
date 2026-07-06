export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { prisma } from '@/lib/db';

/**
 * GET /api/admin/users — list users for the admin console (ADMIN only).
 * Optional ?q= filters by email (case-insensitive substring).
 * Never returns passwordHash or token values.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  try {
    const users = await prisma.user.findMany({
      where: q ? { email: { contains: q, mode: 'insensitive' } } : undefined,
      orderBy: [{ role: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        email: true,
        role: true,
        niaUserId: true,
        createdAt: true,
        disabled: true,
        passwordHash: true,
        resetTokenHash: true,
        resetTokenExpiry: true,
        // Referral tree (Phase A): this user's code, who invited them, and how
        // many people they've directly invited.
        referralCode: true,
        referredBy: { select: { email: true } },
        _count: { select: { referrals: true } },
      },
    });

    const now = Date.now();
    const data = users.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      niaUserId: u.niaUserId,
      createdAt: u.createdAt,
      disabled: u.disabled,
      authMethod: u.passwordHash ? 'password' : 'google',
      resetPending: Boolean(u.resetTokenHash && u.resetTokenExpiry && u.resetTokenExpiry.getTime() > now),
      referralCode: u.referralCode,
      invitedBy: u.referredBy?.email ?? null,
      referralCount: u._count.referrals,
    }));

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error('[admin/users] database error:', e);
    return NextResponse.json(
      { ok: false, error: 'Account service unavailable. Please try again later.' },
      { status: 503 },
    );
  }
}
