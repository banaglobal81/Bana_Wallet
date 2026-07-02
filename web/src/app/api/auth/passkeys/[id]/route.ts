export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

// DELETE /api/auth/passkeys/[id] — remove one of the user's own passkeys.
// deleteMany scoped to userId ensures a user can only delete their own device.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  await prisma.passkey.deleteMany({ where: { id, userId } });
  return NextResponse.json({ ok: true });
}
