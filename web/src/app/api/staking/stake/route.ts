export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { niaWalletRequest } from '@/lib/nia/client';
import { resolveSessionUserId } from '@/lib/nia/resolve';
import { settleMaturedPositions, lockedPrincipalByCoin } from '@/lib/staking';
import { DAY_MS } from '@/lib/stakingMath';

function err(e: unknown) {
  const x = e as Error & { status?: number };
  return NextResponse.json({ ok: false, error: x.message }, { status: x.status ?? 500 });
}

// Sum the available (free) balance for a coin from a Nia /wallets response.
function sumBalance(raw: unknown, coin: string): Decimal {
  const rows: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? Object.values(raw as Record<string, unknown>).flatMap((v) => (Array.isArray(v) ? v : []))
      : [];
  let total = new Decimal(0);
  for (const r of rows as Array<{ currency?: string; balance?: string }>) {
    if ((r?.currency ?? '').toUpperCase() === coin.toUpperCase()) total = total.plus(new Decimal(r.balance ?? '0'));
  }
  return total;
}

// POST /api/staking/stake — lock funds into a staking product.
export async function POST(req: Request): Promise<NextResponse> {
  let niaUserId: string, dbUserId: string, email: string;
  try {
    await requireUser();
    niaUserId = await resolveSessionUserId();
    const u = (await auth())?.user as { id?: string; email?: string } | undefined;
    if (!u?.id) throw Object.assign(new Error('Unauthorized'), { status: 401 });
    dbUserId = u.id; email = u.email ?? '';
  } catch (e) { return err(e); }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}
  const productId = String(body.productId ?? '');

  let amount: Decimal;
  try {
    amount = new Decimal(String(body.amount ?? ''));
    if (!amount.isFinite() || amount.lte(0)) throw new Error('bad');
  } catch {
    return NextResponse.json({ ok: false, error: 'Enter a valid amount greater than 0' }, { status: 400 });
  }

  const product = await prisma.stakingProduct.findUnique({ where: { id: productId } });
  if (!product) return NextResponse.json({ ok: false, error: 'Staking product not found' }, { status: 404 });
  if (product.status !== 'OPEN') {
    return NextResponse.json({ ok: false, error: 'This staking product is closed.' }, { status: 409 });
  }

  // Per-stake min / max.
  if (product.minAmount && amount.lt(new Decimal(product.minAmount))) {
    return NextResponse.json({ ok: false, error: `Minimum stake is ${product.minAmount} ${product.coin}.` }, { status: 400 });
  }
  if (product.maxAmount && amount.gt(new Decimal(product.maxAmount))) {
    return NextResponse.json({ ok: false, error: `Maximum stake is ${product.maxAmount} ${product.coin}.` }, { status: 400 });
  }

  // Product capacity (total across all active positions).
  if (product.capacity) {
    const active = await prisma.stakePosition.findMany({
      where: { productId, status: 'ACTIVE' }, select: { principal: true },
    });
    const used = active.reduce((s, p) => s.plus(new Decimal(p.principal)), new Decimal(0));
    if (used.plus(amount).gt(new Decimal(product.capacity))) {
      const left = Decimal.max(0, new Decimal(product.capacity).minus(used));
      return NextResponse.json({ ok: false, error: `Not enough capacity left in this product (only ${left.toFixed()} ${product.coin} available).` }, { status: 409 });
    }
  }

  // Available balance = Nia free balance − already-locked staked principal.
  await settleMaturedPositions(dbUserId);
  let available: Decimal;
  try {
    const raw = await niaWalletRequest('GET', '/api/v1/wallets', { query: { userId: niaUserId, currency: product.coin } });
    const niaBal = sumBalance(raw, product.coin);
    const locked = (await lockedPrincipalByCoin(dbUserId)).get(product.coin) ?? new Decimal(0);
    available = niaBal.minus(locked);
  } catch (e) { return err(e); }

  if (amount.gt(available)) {
    return NextResponse.json(
      { ok: false, error: `Not enough available ${product.coin}. You have ${Decimal.max(0, available).toFixed()} free to stake.` },
      { status: 400 },
    );
  }

  const startAt = new Date();
  const maturityAt = new Date(startAt.getTime() + product.termDays * DAY_MS);
  const position = await prisma.stakePosition.create({
    data: {
      userId: dbUserId, niaUserId, email, productId: product.id, coin: product.coin,
      principal: amount.toFixed(), dailyRatePct: product.dailyRatePct, termDays: product.termDays,
      startAt, maturityAt,
    },
  });

  return NextResponse.json({ ok: true, data: { id: position.id, maturityAt: maturityAt.toISOString() } });
}
