export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

// DELETE /api/auth/sessions/[id] — log out one device. Scoped to userId so a
// user can only end their own sessions. Deleting the current session logs this
// device out on its next request (requireUser sees the row is gone).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  await prisma.loginSession.deleteMany({ where: { id, userId } });
  return NextResponse.json({ ok: true });
}
