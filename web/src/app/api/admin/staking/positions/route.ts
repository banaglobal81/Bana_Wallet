export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit';
import { settleMaturedPositions, serializePosition } from '@/lib/staking';
import { DAY_MS } from '@/lib/stakingMath';

// GET /api/admin/staking/positions — all stake positions (oversight).
export async function GET(): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  await settleMaturedPositions();

  const rows = await prisma.stakePosition.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { product: { select: { name: true } } },
  });

  const data = rows.map((p) => ({
    ...serializePosition(p),
    email: p.email,
    productName: p.product?.name ?? '',
  }));
  return NextResponse.json({ ok: true, data });
}

/**
 * POST /api/admin/staking/positions — ADMIN grants a staking position to a user.
 *
 * Unlike the user flow (/api/staking/stake), this does NOT require the user to
 * hold a Nia-Hub balance: BANA is the platform's own token, so an admin can
 * issue a staked position as a bonus/promotion. The granted principal is a
 * deliberate liability of the platform, so:
 *   - ADMIN role is required,
 *   - every grant is written to the audit log (who / whom / how much),
 *   - the product's min/max rules are still enforced (a grant shouldn't be able
 *     to create a position the product itself would reject).
 *
 * The position is identical to a user-created one, so it accrues and pays
 * interest through the normal settlement engine.
 */
export async function POST(req: Request): Promise<NextResponse> {
  let admin;
  try { admin = await requireAdmin(); } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}

  const email = String(body.email ?? '').trim().toLowerCase();
  const productId = String(body.productId ?? '').trim();
  const rawAmount = String(body.amount ?? '').trim();

  if (!email) return NextResponse.json({ ok: false, error: 'User email is required' }, { status: 400 });
  if (!productId) return NextResponse.json({ ok: false, error: 'Staking product is required' }, { status: 400 });

  let amount: Decimal;
  try { amount = new Decimal(rawAmount || '0'); } catch {
    return NextResponse.json({ ok: false, error: 'Enter a valid amount' }, { status: 400 });
  }
  if (!amount.isFinite() || amount.lte(0)) {
    return NextResponse.json({ ok: false, error: 'Enter a valid amount greater than 0' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, niaUserId: true },
  });
  if (!user) return NextResponse.json({ ok: false, error: `No user found with email ${email}` }, { status: 404 });
  if (!user.niaUserId) {
    return NextResponse.json({ ok: false, error: 'That user has no Nia user id — cannot create a position.' }, { status: 409 });
  }

  const product = await prisma.stakingProduct.findUnique({ where: { id: productId } });
  if (!product) return NextResponse.json({ ok: false, error: 'Staking product not found' }, { status: 404 });

  // Same position-validity rules as the user flow — a grant shouldn't be able to
  // create a position the product itself would reject. (Product status and
  // capacity are intentionally NOT enforced: a grant is a deliberate admin
  // override, e.g. issuing a bonus into a closed or full pool.)
  if (product.minAmount && amount.lt(new Decimal(product.minAmount))) {
    return NextResponse.json({ ok: false, error: `Minimum for this product is ${product.minAmount} ${product.coin}.` }, { status: 400 });
  }
  if (product.maxAmount && amount.gt(new Decimal(product.maxAmount))) {
    return NextResponse.json({ ok: false, error: `Maximum for this product is ${product.maxAmount} ${product.coin}.` }, { status: 400 });
  }

  // Mirror the user stake route so a granted position behaves identically.
  const startAt = new Date();
  const maturityAt = new Date(startAt.getTime() + product.termDays * DAY_MS);

  const position = await prisma.stakePosition.create({
    data: {
      userId: user.id,
      niaUserId: user.niaUserId,
      email: user.email,
      productId: product.id,
      coin: product.coin,
      principal: amount.toFixed(),
      dailyRatePct: product.dailyRatePct,
      termDays: product.termDays,
      startAt,
      maturityAt,
    },
  });

  await recordAudit({
    adminId: (admin as { id?: string }).id,
    adminEmail: (admin as { email?: string }).email,
    action: 'STAKING_POSITION_GRANT',
    targetType: 'stakePosition',
    targetId: position.id,
    detail: `Granted ${amount.toFixed()} ${product.coin} staked for ${user.email} into "${product.name}" (${product.termDays}d @ ${product.dailyRatePct}%/day)`,
  });

  return NextResponse.json({ ok: true, data: { id: position.id } });
}
