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

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

interface NetIn { code?: unknown; contractAddress?: unknown; decimals?: unknown }

// Validate + normalize the networks array. Each EVM network needs a valid
// contract address (0x + 40 hex) and decimals (0–36).
function parseNetworks(raw: unknown): Array<{ code: string; contractAddress: string; decimals: number }> {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw Object.assign(new Error('Add at least one network with a contract address'), { status: 400 });
  }
  return raw.map((n: NetIn, i) => {
    const code = String(n.code ?? '').trim().toUpperCase();
    const contractAddress = String(n.contractAddress ?? '').trim();
    const decimals = Number(n.decimals);
    if (!code) throw Object.assign(new Error(`Network #${i + 1}: network is required`), { status: 400 });
    if (!EVM_ADDRESS.test(contractAddress)) {
      throw Object.assign(new Error(`Network ${code}: contract address must be 0x followed by 40 hex characters`), { status: 400 });
    }
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
      throw Object.assign(new Error(`Network ${code}: decimals must be a whole number between 0 and 36`), { status: 400 });
    }
    return { code, contractAddress, decimals };
  });
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
