export const runtime = 'nodejs';

// PATCH /api/admin/reserve/addresses/[id] — deactivate a controlled address
// (A-8 §6.4 RG-4). Soft delete only (active=false + removedAt) — a past
// ReserveVerificationRun's controlledAddressCount must stay reconstructable.

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { recordAudit } from '@/lib/audit';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (body?.active !== false) {
    return NextResponse.json({ ok: false, error: 'This endpoint only deactivates (active: false).' }, { status: 400 });
  }

  const existing = await prisma.platformControlledAddress.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ ok: false, error: 'Address not found' }, { status: 404 });
  if (!existing.active) return NextResponse.json({ ok: true, data: existing });

  const updated = await prisma.platformControlledAddress.update({
    where: { id },
    data: { active: false, removedAt: new Date() },
  });
  await recordAudit({
    adminId,
    adminEmail,
    action: 'RESERVE_CONTROLLED_ADDRESS_DEACTIVATED',
    targetType: 'PlatformControlledAddress',
    targetId: id,
    detail: `${existing.coin}/${existing.network}: ${existing.address}`,
  });
  return NextResponse.json({ ok: true, data: updated });
}
