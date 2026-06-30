export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit';

function adminErr(e: unknown) {
  const err = e as Error & { status?: number };
  return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
}

// PATCH /api/admin/coins/[id] — toggle visibility (show/hide in the user list).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  let admin;
  try { admin = await requireAdmin(); } catch (e) { return adminErr(e); }
  const { id } = await params;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}

  const existing = await prisma.managedCoin.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ ok: false, error: 'Coin not found' }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (typeof body.visible === 'boolean') data.visible = body.visible;
  if (body.name !== undefined && String(body.name).trim()) data.name = String(body.name).trim();
  if (Object.keys(data).length === 0) return NextResponse.json({ ok: true, data: { id } });

  await prisma.managedCoin.update({ where: { id }, data });
  await recordAudit({
    adminId: (admin as { id?: string }).id, adminEmail: (admin as { email?: string }).email,
    action: 'COIN_UPDATE', targetType: 'managedCoin', targetId: id,
    detail: `Coin ${existing.symbol}: ${'visible' in data ? (data.visible ? 'shown to users' : 'hidden') : 'updated'}`,
  });
  return NextResponse.json({ ok: true, data: { id } });
}

// DELETE /api/admin/coins/[id] — remove a managed coin.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  let admin;
  try { admin = await requireAdmin(); } catch (e) { return adminErr(e); }
  const { id } = await params;

  const coin = await prisma.managedCoin.findUnique({ where: { id } });
  if (!coin) return NextResponse.json({ ok: false, error: 'Coin not found' }, { status: 404 });

  await prisma.managedCoin.delete({ where: { id } });
  await recordAudit({
    adminId: (admin as { id?: string }).id, adminEmail: (admin as { email?: string }).email,
    action: 'COIN_DELETE', targetType: 'managedCoin', targetId: id,
    detail: `Removed coin ${coin.symbol}`,
  });
  return NextResponse.json({ ok: true, data: { id } });
}
