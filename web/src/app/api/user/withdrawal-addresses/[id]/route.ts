export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db';

/** DELETE — remove one of the current user's saved addresses (own only). */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let uid: string | undefined;
  try {
    uid = ((await requireUser()) as { id?: string }).id;
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 401 });
  }

  const { id } = await params;
  try {
    // Scope the delete to the owner so a user can't delete someone else's entry.
    const res = await prisma.withdrawalAddress.deleteMany({ where: { id, userId: uid } });
    if (res.count === 0) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[withdrawal-addresses DELETE]', e);
    return NextResponse.json({ ok: false, error: 'Service unavailable.' }, { status: 503 });
  }
}
