export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { niaWalletRequest } from '@/lib/nia/client';

/**
 * GET /api/admin/users/[id]/wallet — per-user wallet oversight (ADMIN only).
 * Looks up the target user's niaUserId, then fetches their balances + recent
 * deposits/withdrawals from Nia-Hub. Read-only; for support & compliance.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  const { id } = await params;
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { email: true, niaUserId: true },
    });
    if (!user) {
      return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 });
    }
    if (!user.niaUserId) {
      return NextResponse.json({ ok: true, data: { email: user.email, niaUserId: null, balance: null, deposits: [], withdrawals: [] } });
    }

    const userId = user.niaUserId;
    // Fetch in parallel; tolerate a single source failing without breaking the rest.
    const [balance, deposits, withdrawals] = await Promise.all([
      niaWalletRequest('GET', '/api/v1/wallets', { query: { userId } }).catch(() => null),
      niaWalletRequest('GET', '/api/v1/deposits', { query: { userId, limit: '10' } }).catch(() => null),
      niaWalletRequest('GET', '/api/v1/withdrawals', { query: { userId, limit: '10' } }).catch(() => null),
    ]);

    const items = (v: unknown): unknown[] => {
      const d = v as { items?: unknown[] } | unknown[] | null;
      if (Array.isArray(d)) return d;
      return (d as { items?: unknown[] })?.items ?? [];
    };

    return NextResponse.json({
      ok: true,
      data: {
        email: user.email,
        niaUserId: userId,
        balance,
        deposits: items(deposits),
        withdrawals: items(withdrawals),
      },
    });
  } catch (e) {
    console.error('[admin/users/wallet] error:', e);
    return NextResponse.json(
      { ok: false, error: 'Account service unavailable. Please try again later.' },
      { status: 503 },
    );
  }
}
