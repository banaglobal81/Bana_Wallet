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
    // admin-staking-debt-visibility-frd.md §4.4 P-5 — derived HERE, not in
    // serializePosition (A6: that function deliberately omits admin identity
    // from the response so the user-facing /api/staking/positions route
    // never leaks it). This route is admin-only (requireAdmin above).
    isGrant: p.grantedByAdminId != null,
  }));
  return NextResponse.json({ ok: true, data });
}

/**
 * POST /api/admin/staking/positions — ADMIN grants a staking position to a user.
 *
 * docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md §2.2
 * CS-1′: this route is fail-closed and ALWAYS returns 409 GRANT_DISABLED_V2_CORE,
 * regardless of product/status/body. rev04 §1.8 G-E ("V2-CORE does not offer a
 * grant path") was written against the V2 path only and was never applied to
 * this still-live v1 route — PoR's `grantPrincipalPayableTotal` only reads
 * `StakePositionV2` (web/src/lib/localLedger.ts), so any v1 grant is invisible
 * debt to reserve accounting, even for an OPEN product. This is entry-point
 * rejection (CS-1′ requires NOT deleting the code below), kept until CUT-3/
 * CUT-4 replace it with a V2 grant implementation. Do NOT reintroduce a
 * conditional (e.g. `product.status !== 'OPEN'`) gate here — CS-1′ is
 * unconditional for every input.
 *
 * The dead code below (pre-CS-1′ implementation) is intentionally left in
 * place, unreachable, as the basis for the eventual V2 replacement.
 */
export async function POST(_req: Request): Promise<NextResponse> {
  try { await requireAdmin(); } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  return NextResponse.json(
    { ok: false, error: 'Staking grants are temporarily disabled while the platform migrates to V2-CORE.', code: 'GRANT_DISABLED_V2_CORE' },
    { status: 409 },
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _legacyGrantPositionUnreachable(req: Request, admin: Awaited<ReturnType<typeof requireAdmin>>): Promise<NextResponse> {
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
      // R-5/R-6 (docs/specs/staking-auto-renew-ruling.md §2.4): marks this as
      // an admin grant, which makes it ineligible for auto-renew at every
      // layer (no toggle rendered, PATCH .../auto-renew 409s, E9 inside the
      // maturity transaction). Note this route deliberately does NOT read an
      // `autoRenew` field from the request body at all — an admin may not
      // opt a user into a standing capital-lock instruction (R-6). `autoRenew`
      // therefore stays at its schema default (false).
      grantedByAdminId: (admin as { id?: string }).id ?? null,
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
