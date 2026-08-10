export const runtime = 'nodejs';

// POST /api/admin/reserve/verify — A-8 §6.7 HI-4. Manual, read-only PoR-1″
// check (runReserveVerification never moves funds — it only reads and
// records a ReserveVerificationRun snapshot). requireAdmin()-gated.
//
// body: { coin: string }
//
// HI-4: a 30s per-coin cooldown, and a rejected (cooled-down) request never
// creates a ReserveVerificationRun row (AC-36-equivalent — no in-memory Set
// import from web/src/lib/nia/state.ts here, since that file is
// web-shared-expert's owned scope; a local per-process Map is sufficient for
// this "fast path" cooldown, same reasoning as niaState's own comment that
// it is only a per-process guard, not the source of truth).

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { runReserveVerification } from '@/lib/localLedger';
import { recordAudit } from '@/lib/audit';

const COOLDOWN_MS = 30_000;
const lastManualRunAt = new Map<string, number>();

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
  const coin = typeof body?.coin === 'string' ? body.coin : '';
  if (!coin) return NextResponse.json({ ok: false, error: 'coin is required' }, { status: 400 });

  const last = lastManualRunAt.get(coin) ?? 0;
  const now = Date.now();
  if (now - last < COOLDOWN_MS) {
    return NextResponse.json(
      { ok: false, error: `Please wait before re-running verification for ${coin}.`, reason: 'COOLDOWN' },
      { status: 429 },
    );
  }
  lastManualRunAt.set(coin, now);

  try {
    const run = await runReserveVerification(coin, 'MANUAL_ADMIN');
    await recordAudit({
      adminId,
      adminEmail,
      action: 'RESERVE_VERIFICATION_MANUAL_RUN',
      targetType: 'ReserveVerificationRun',
      targetId: run.id,
      detail: `${coin}: ${run.result}`,
    });
    return NextResponse.json({ ok: true, data: { id: run.id, result: run.result } });
  } catch (e) {
    console.error('[admin/reserve/verify] error:', e);
    return NextResponse.json({ ok: false, error: 'Reserve verification failed to run. Please try again later.' }, { status: 503 });
  }
}
