export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit';
import { aprPct } from '@/lib/stakingMath';

function adminErr(e: unknown) {
  const err = e as Error & { status?: number };
  return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
}

// Parse a positive decimal money string; '' / null -> null; invalid -> throws.
function parseMoney(v: unknown, field: string): string | null {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const d = new Decimal(String(v));
  if (!d.isFinite() || d.lt(0)) throw Object.assign(new Error(`${field} must be a non-negative number`), { status: 400 });
  return d.toFixed();
}

// GET /api/admin/staking/products — all products with staked totals + counts.
export async function GET(): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (e) { return adminErr(e); }

  const products = await prisma.stakingProduct.findMany({ orderBy: { createdAt: 'desc' } });
  const active = await prisma.stakePosition.findMany({
    where: { status: 'ACTIVE' },
    select: { productId: true, principal: true },
  });
  const totals = new Map<string, { staked: Decimal; count: number }>();
  for (const p of active) {
    const t = totals.get(p.productId) ?? { staked: new Decimal(0), count: 0 };
    t.staked = t.staked.plus(new Decimal(p.principal));
    t.count += 1;
    totals.set(p.productId, t);
  }

  const data = products.map((p) => {
    const t = totals.get(p.id);
    return {
      id: p.id, coin: p.coin, name: p.name, termDays: p.termDays,
      dailyRatePct: p.dailyRatePct, aprPct: aprPct(p.dailyRatePct).toFixed(2),
      minAmount: p.minAmount, maxAmount: p.maxAmount, capacity: p.capacity,
      status: p.status, createdAt: p.createdAt.toISOString(),
      totalStaked: (t?.staked ?? new Decimal(0)).toFixed(), positionCount: t?.count ?? 0,
    };
  });
  return NextResponse.json({ ok: true, data });
}

// POST /api/admin/staking/products — create a new staking product.
export async function POST(req: Request): Promise<NextResponse> {
  let admin;
  try { admin = await requireAdmin(); } catch (e) { return adminErr(e); }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}

  const coin = String(body.coin ?? '').trim().toUpperCase();
  const name = String(body.name ?? '').trim();
  const termDays = Number(body.termDays);
  if (!coin) return NextResponse.json({ ok: false, error: 'Coin is required' }, { status: 400 });
  // Policy: only the BANA token is stakeable.
  if (coin !== 'BANA') return NextResponse.json({ ok: false, error: 'Only BANA staking is supported.' }, { status: 400 });
  if (!name) return NextResponse.json({ ok: false, error: 'Name is required' }, { status: 400 });
  if (!Number.isInteger(termDays) || termDays <= 0) {
    return NextResponse.json({ ok: false, error: 'Term (days) must be a whole number greater than 0' }, { status: 400 });
  }

  let dailyRatePct: string, minAmount: string | null, maxAmount: string | null, capacity: string | null;
  try {
    const rate = new Decimal(String(body.dailyRatePct ?? ''));
    if (!rate.isFinite() || rate.lte(0)) throw Object.assign(new Error('Daily rate must be greater than 0'), { status: 400 });
    dailyRatePct = rate.toFixed();
    minAmount = parseMoney(body.minAmount, 'Minimum');
    maxAmount = parseMoney(body.maxAmount, 'Maximum');
    capacity = parseMoney(body.capacity, 'Capacity');
  } catch (e) { return adminErr(e); }

  const product = await prisma.stakingProduct.create({
    data: { coin, name, termDays, dailyRatePct, minAmount, maxAmount, capacity },
  });

  await recordAudit({
    adminId: (admin as { id?: string }).id, adminEmail: (admin as { email?: string }).email,
    action: 'STAKING_PRODUCT_CREATE', targetType: 'stakingProduct', targetId: product.id,
    detail: `Created staking product "${name}" — ${coin}, ${termDays} days at ${dailyRatePct}%/day`,
  });

  return NextResponse.json({ ok: true, data: { id: product.id } });
}
