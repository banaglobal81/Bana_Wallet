export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireAdmin } from '@/lib/auth/session';
import { r2Configured, r2Put } from '@/lib/r2';

const ALLOWED: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/gif': 'gif',
};
const MAX_BYTES = 1_000_000; // 1 MB — logos are small

// POST /api/admin/upload — upload a logo image to R2, returns its key.
export async function POST(req: Request): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  if (!r2Configured()) {
    return NextResponse.json({ ok: false, error: 'Image uploads are not configured (R2 storage). Add the R2 keys to the server config.' }, { status: 503 });
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get('file');
    if (f instanceof File) file = f;
  } catch { /* not multipart */ }

  if (!file) return NextResponse.json({ ok: false, error: 'No file uploaded' }, { status: 400 });

  const ext = ALLOWED[file.type];
  if (!ext) return NextResponse.json({ ok: false, error: 'Unsupported image type. Use PNG, JPG, WEBP, SVG or GIF.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: 'Image is too large (max 1 MB).' }, { status: 400 });

  const folder = String((new URL(req.url)).searchParams.get('folder') || 'logos').replace(/[^a-z0-9-]/gi, '') || 'logos';
  const key = `${folder}/${randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    await r2Put(key, bytes, file.type);
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 502 });
  }

  return NextResponse.json({ ok: true, data: { key } });
}
