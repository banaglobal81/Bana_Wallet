export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { prisma } from '@/lib/db';

/**
 * GET /api/admin/audit — recent admin-action audit log (ADMIN only).
 * Optional ?limit (default 50, max 200).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  const raw = Number(req.nextUrl.searchParams.get('limit') ?? '50');
  const limit = Number.isFinite(raw) ? Math.min(Math.max(1, raw), 200) : 50;

  try {
    const items = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
    return NextResponse.json({ ok: true, data: items });
  } catch (e) {
    console.error('[admin/audit] database error:', e);
    return NextResponse.json(
      { ok: false, error: 'Service unavailable. Please try again later.' },
      { status: 503 },
    );
  }
}
