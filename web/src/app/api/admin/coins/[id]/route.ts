export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit';
import { parseNetworks, type CoinNetwork } from '@/lib/coins';

function adminErr(e: unknown) {
  const err = e as Error & { status?: number };
  return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
}

// Build a short human-readable audit note describing which fields changed —
// in particular, spell out any contract-address migration (old → new).
function describeChange(existing: { networks: unknown }, data: Record<string, unknown>): string {
  const parts: string[] = [];
  if ('visible' in data) parts.push(data.visible ? 'shown to users' : 'hidden');
  if ('name' in data) parts.push(`renamed to "${data.name}"`);
  if ('networks' in data) {
    const before = (Array.isArray(existing.networks) ? existing.networks : []) as CoinNetwork[];
    const after = data.networks as CoinNetwork[];
    const moved = after
      .map((n) => {
        const prev = before.find((b) => b.code === n.code);
        return prev && prev.contractAddress.toLowerCase() !== n.contractAddress.toLowerCase()
          ? `${n.code} ${prev.contractAddress} → ${n.contractAddress}`
          : null;
      })
      .filter(Boolean);
    parts.push(moved.length ? `contract updated (${moved.join('; ')})` : 'networks updated');
  }
  return parts.length ? parts.join(', ') : 'updated';
}

// PATCH /api/admin/coins/[id] — edit a managed coin: toggle visibility, rename,
// or update its networks / contract addresses (e.g. migrating a token to a new
// contract). The user-facing coin list reads the same record, so any change
// here is immediately reflected on both the admin and user sides.
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
  if (body.networks !== undefined) {
    try { data.networks = parseNetworks(body.networks); } catch (e) { return adminErr(e); }
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ ok: true, data: { id } });

  await prisma.managedCoin.update({ where: { id }, data });
  await recordAudit({
    adminId: (admin as { id?: string }).id, adminEmail: (admin as { email?: string }).email,
    action: 'COIN_UPDATE', targetType: 'managedCoin', targetId: id,
    detail: `Coin ${existing.symbol}: ${describeChange(existing, data)}`,
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
