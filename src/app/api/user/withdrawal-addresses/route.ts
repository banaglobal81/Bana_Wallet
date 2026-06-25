export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db';

function userId(u: unknown): string | undefined {
  return (u as { id?: string } | undefined)?.id;
}

/** GET — list the current user's saved withdrawal addresses. */
export async function GET(): Promise<NextResponse> {
  let uid: string | undefined;
  try {
    uid = userId(await requireUser());
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 401 });
  }
  try {
    const items = await prisma.withdrawalAddress.findMany({
      where: { userId: uid },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ ok: true, data: items });
  } catch (e) {
    console.error('[withdrawal-addresses GET]', e);
    return NextResponse.json({ ok: false, error: 'Service unavailable.' }, { status: 503 });
  }
}

/** POST — add a saved address. Body: { label, network, address } */
export async function POST(req: Request): Promise<NextResponse> {
  let uid: string | undefined;
  try {
    uid = userId(await requireUser());
    if (!uid) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 401 });
  }

  let body: { label?: unknown; network?: unknown; address?: unknown } = {};
  try { body = await req.json(); } catch { body = {}; }
  const label = String(body.label ?? '').trim().slice(0, 60);
  const network = String(body.network ?? '').trim().slice(0, 16);
  const address = String(body.address ?? '').trim().slice(0, 120);

  if (!label) return NextResponse.json({ ok: false, error: 'Label is required' }, { status: 400 });
  if (!network) return NextResponse.json({ ok: false, error: 'Network is required' }, { status: 400 });
  if (address.length < 16) return NextResponse.json({ ok: false, error: 'A valid address is required' }, { status: 400 });

  try {
    // Cap how many a user can store, and avoid exact duplicates.
    const existing = await prisma.withdrawalAddress.findFirst({ where: { userId: uid, network, address } });
    if (existing) return NextResponse.json({ ok: false, error: 'That address is already saved' }, { status: 409 });
    const count = await prisma.withdrawalAddress.count({ where: { userId: uid } });
    if (count >= 50) return NextResponse.json({ ok: false, error: 'Address book is full (50 max)' }, { status: 400 });

    const item = await prisma.withdrawalAddress.create({ data: { userId: uid, label, network, address } });
    return NextResponse.json({ ok: true, data: item });
  } catch (e) {
    console.error('[withdrawal-addresses POST]', e);
    return NextResponse.json({ ok: false, error: 'Service unavailable.' }, { status: 503 });
  }
}
