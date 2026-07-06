export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { ensureReferralCode } from '@/lib/referral';

// GET /api/referral — the signed-in user's referral code, invite link, who
// invited them, and their direct-referral count. Phase A: relationship data
// only, no commission/bonus figures.
export async function GET(): Promise<NextResponse> {
  let userId: string;
  try {
    const me = (await requireUser()) as { id?: string };
    if (!me.id) throw Object.assign(new Error('Unauthorized'), { status: 401 });
    userId = me.id;
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  const code = await ensureReferralCode(userId);

  const [directReferrals, me] = await Promise.all([
    prisma.user.count({ where: { referredById: userId } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { referredBy: { select: { email: true, referralCode: true } } },
    }),
  ]);

  const base = (process.env.APP_URL || '').replace(/\/$/, '');
  const link = base ? `${base}/signup?ref=${code}` : `/signup?ref=${code}`;

  return NextResponse.json({
    ok: true,
    data: {
      code,
      link,
      directReferrals,
      invitedBy: me?.referredBy?.referralCode ?? null,
    },
  });
}
