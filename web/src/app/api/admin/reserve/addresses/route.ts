export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET/POST /api/admin/reserve/addresses — PlatformControlledAddress registry
// (A-8 §6.4 RG-1~RG-8). This is PoR-1″'s right-hand side (rev04 §1.7 PoR-G1) —
// there is deliberately no field anywhere in this route that lets an admin
// type in a reserve *amount* (RG-5): the right side is always the on-chain
// balance of a registered address, never a typed number.

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { recordAudit } from '@/lib/audit';

export async function GET(): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  const rows = await prisma.platformControlledAddress.findMany({
    orderBy: [{ coin: 'asc' }, { active: 'desc' }, { addedAt: 'desc' }],
  });
  return NextResponse.json({ ok: true, data: rows });
}

export async function POST(req: Request): Promise<NextResponse> {
  let adminId: string | undefined;
  let adminEmail: string | undefined;
  try {
    const me = (await requireAdmin()) as { id?: string; email?: string };
    adminId = me.id;
    adminEmail = me.email;
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  const body = await req.json().catch(() => ({}));
  const coin = typeof body?.coin === 'string' ? body.coin.trim() : '';
  const network = typeof body?.network === 'string' ? body.network.trim() : '';
  const address = typeof body?.address === 'string' ? body.address.trim() : '';
  const label = typeof body?.label === 'string' ? body.label.trim() : '';
  const notes = typeof body?.notes === 'string' ? body.notes.trim() : null;

  if (!coin || !network || !address || !label) {
    return NextResponse.json({ ok: false, error: 'coin, network, address and label are required.' }, { status: 400 });
  }
  // RG-3 — basic EVM address-shape check (0x + 40 hex). Not a checksum
  // validator; the on-chain read itself is the real correctness check.
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ ok: false, error: 'Address does not look like an EVM address (0x + 40 hex chars).' }, { status: 400 });
  }

  try {
    const created = await prisma.platformControlledAddress.create({
      data: {
        coin,
        network,
        address,
        label,
        notes,
        addedByAdminId: adminId ?? '',
        addedByEmail: adminEmail ?? 'unknown',
      },
    });
    await recordAudit({
      adminId,
      adminEmail,
      action: 'RESERVE_CONTROLLED_ADDRESS_ADDED',
      targetType: 'PlatformControlledAddress',
      targetId: created.id,
      detail: `${coin}/${network}: ${address} (${label})`,
    });
    return NextResponse.json({ ok: true, data: created });
  } catch (e) {
    const err = e as Error & { code?: string };
    if (err.code === 'P2002') {
      return NextResponse.json({ ok: false, error: 'This coin/network/address is already registered.' }, { status: 409 });
    }
    console.error('[admin/reserve/addresses] error:', e);
    return NextResponse.json({ ok: false, error: 'Could not register the address. Please try again later.' }, { status: 503 });
  }
}
