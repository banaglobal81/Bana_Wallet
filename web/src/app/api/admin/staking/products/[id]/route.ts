export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit';

function adminErr(e: unknown) {
  const err = e as Error & { status?: number };
  return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
}
function parseMoney(v: unknown, field: string): string | null {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const d = new Decimal(String(v));
  if (!d.isFinite() || d.lt(0)) throw Object.assign(new Error(`${field} must be a non-negative number`), { status: 400 });
  return d.toFixed();
}

// PATCH /api/admin/staking/products/[id] — open/close or edit a product.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  let admin;
  try { admin = await requireAdmin(); } catch (e) { return adminErr(e); }
  const { id } = await params;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}

  const existing = await prisma.stakingProduct.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ ok: false, error: 'Product not found' }, { status: 404 });

  const data: Record<string, unknown> = {};
  const changes: string[] = [];

  if (body.status !== undefined) {
    const status = String(body.status).toUpperCase();
    if (status !== 'OPEN' && status !== 'CLOSED') {
      return NextResponse.json({ ok: false, error: 'status must be OPEN or CLOSED' }, { status: 400 });
    }
    if (status !== existing.status) { data.status = status; changes.push(status === 'OPEN' ? 'Opened' : 'Closed'); }
  }
  if (body.name !== undefined && String(body.name).trim()) {
    data.name = String(body.name).trim(); changes.push('renamed');
  }
  try {
    if (body.dailyRatePct !== undefined) {
      const rate = new Decimal(String(body.dailyRatePct));
      if (!rate.isFinite() || rate.lte(0)) throw Object.assign(new Error('Daily rate must be greater than 0'), { status: 400 });
      data.dailyRatePct = rate.toFixed(); changes.push(`rate → ${rate.toFixed()}%/day`);
    }
    if (body.minAmount !== undefined) data.minAmount = parseMoney(body.minAmount, 'Minimum');
    if (body.maxAmount !== undefined) data.maxAmount = parseMoney(body.maxAmount, 'Maximum');
    if (body.capacity !== undefined) data.capacity = parseMoney(body.capacity, 'Capacity');
  } catch (e) { return adminErr(e); }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: true, data: { id } });
  }

  await prisma.stakingProduct.update({ where: { id }, data });
  await recordAudit({
    adminId: (admin as { id?: string }).id, adminEmail: (admin as { email?: string }).email,
    action: 'STAKING_PRODUCT_UPDATE', targetType: 'stakingProduct', targetId: id,
    detail: `Staking "${existing.name}": ${changes.join(' · ') || 'updated'}`,
  });
  return NextResponse.json({ ok: true, data: { id } });
}

// DELETE /api/admin/staking/products/[id] — only allowed when no positions exist.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  let admin;
  try { admin = await requireAdmin(); } catch (e) { return adminErr(e); }
  const { id } = await params;

  const product = await prisma.stakingProduct.findUnique({ where: { id } });
  if (!product) return NextResponse.json({ ok: false, error: 'Product not found' }, { status: 404 });

  const count = await prisma.stakePosition.count({ where: { productId: id } });
  if (count > 0) {
    return NextResponse.json(
      { ok: false, error: 'This product has stakes and cannot be deleted. Close it instead to stop new stakes.' },
      { status: 409 },
    );
  }

  await prisma.stakingProduct.delete({ where: { id } });
  await recordAudit({
    adminId: (admin as { id?: string }).id, adminEmail: (admin as { email?: string }).email,
    action: 'STAKING_PRODUCT_DELETE', targetType: 'stakingProduct', targetId: id,
    detail: `Deleted staking product "${product.name}"`,
  });
  return NextResponse.json({ ok: true, data: { id } });
}
