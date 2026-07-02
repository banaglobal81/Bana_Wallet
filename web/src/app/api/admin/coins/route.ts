export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit';
import { parseNetworks } from '@/lib/coins';

function adminErr(e: unknown) {
  const err = e as Error & { status?: number };
  return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
}

// GET /api/admin/coins — all admin-managed coins.
export async function GET(): Promise<NextResponse> {
  try { await requireAdmin(); } catch (e) { return adminErr(e); }
  const coins = await prisma.managedCoin.findMany({ orderBy: { createdAt: 'desc' } });
  return NextResponse.json({ ok: true, data: coins });
}

// POST /api/admin/coins — add a custom EVM coin.
export async function POST(req: Request): Promise<NextResponse> {
  let admin;
  try { admin = await requireAdmin(); } catch (e) { return adminErr(e); }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}

  const symbol = String(body.symbol ?? '').trim().toUpperCase();
  const name = String(body.name ?? '').trim();
  if (!symbol) return NextResponse.json({ ok: false, error: 'Symbol is required' }, { status: 400 });
  if (!name) return NextResponse.json({ ok: false, error: 'Name is required' }, { status: 400 });

  let networks;
  try { networks = parseNetworks(body.networks); } catch (e) { return adminErr(e); }

  const existing = await prisma.managedCoin.findUnique({ where: { symbol } });
  if (existing) return NextResponse.json({ ok: false, error: `A coin with symbol ${symbol} already exists.` }, { status: 409 });

  const coin = await prisma.managedCoin.create({
    data: { symbol, name, networks, logoKey: (String(body.logoKey ?? '').trim() || null) },
  });

  await recordAudit({
    adminId: (admin as { id?: string }).id, adminEmail: (admin as { email?: string }).email,
    action: 'COIN_ADD', targetType: 'managedCoin', targetId: coin.id,
    detail: `Added coin ${symbol} (${name}) on ${networks.map((n) => n.code).join(', ')}`,
  });
  return NextResponse.json({ ok: true, data: { id: coin.id } });
}
