export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { serializePosition } from '@/lib/staking';
import { AUTO_RENEW_MAX_TERM_DAYS } from '@/lib/stakingRenew';

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, error, code }, { status });
}

/**
 * PATCH /api/staking/positions/[id]/auto-renew — flip the caller's standing
 * auto-renew instruction on a position they own.
 *
 * See docs/specs/staking-auto-renew-prd.md §4 S4 for the requirement and
 * docs/specs/staking-auto-renew-copy-spec.md §2 for the exact check order,
 * response shape, and copy (this file mirrors that table check-for-check).
 *
 * The off-ramp (`autoRenew: false`) is NEVER gated by eligibility or by
 * `maintenanceMode` (PRD §2's tie-breaking principle, ruling M-3) — turning
 * auto-renew off must always succeed on an ACTIVE position. Only the on-ramp
 * (`autoRenew: true`) is gated (checks 6/7 below).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  // 1 — requireUser(). Identity derived from the session only (CLAUDE.md rule 8).
  let dbUserId: string;
  try {
    await requireUser();
    const u = (await auth())?.user as { id?: string } | undefined;
    if (!u?.id) throw Object.assign(new Error('Unauthorized'), { status: 401 });
    dbUserId = u.id;
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  const { id } = await params;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}

  // 2 — body shape.
  if (typeof body.autoRenew !== 'boolean') {
    return fail(400, 'INVALID_REQUEST', 'Invalid request.');
  }
  const wantOn = body.autoRenew;

  // 3 — exists AND owned by the caller. 404 for BOTH cases — never 403, never
  // a different status that would confirm another user's position exists
  // (CLAUDE.md rule 8).
  const position = await prisma.stakePosition.findUnique({ where: { id } });
  if (!position || position.userId !== dbUserId) {
    return fail(404, 'POSITION_NOT_FOUND', 'Stake not found.');
  }

  // 4 — idempotency short-circuit, BEFORE the eligibility checks (6/7). A
  // no-op { autoRenew: false } on an ineligible position must return 200,
  // not 409 — refusing a request for the state the row is already in would
  // be theatre.
  if (position.autoRenew === wantOn) {
    return NextResponse.json({ ok: true, data: serializePosition(position) });
  }

  // 5 — must be ACTIVE to change at all (applies to both directions).
  if (position.status !== 'ACTIVE') {
    return fail(409, 'POSITION_NOT_ACTIVE', 'This stake has already matured — auto-renew can no longer be changed.');
  }

  // 6/7 — on-ramp only. Distinct messages by design (copy-spec §2.3): the cap
  // refusal is actionable/general, the grant refusal is not and is specific
  // to this position — a shared string would give both users the same
  // non-answer.
  if (wantOn) {
    if (position.grantedByAdminId != null) {
      return fail(
        409,
        'AUTO_RENEW_GRANTED_POSITION',
        "This stake was granted by BANA and can't be set to renew. When it matures, your principal becomes available in your wallet.",
      );
    }
    if (position.termDays > AUTO_RENEW_MAX_TERM_DAYS) {
      return fail(
        409,
        'AUTO_RENEW_TERM_TOO_LONG',
        `Auto-renew is available on stakes with a term of ${AUTO_RENEW_MAX_TERM_DAYS} days or less. This stake's term is ${position.termDays} days.`,
      );
    }
  }

  // No maintenanceMode gate in either direction (copy-spec §2.2): turning off
  // must always work, and turning on locks nothing at the moment of the
  // call, changes no balance, and is reversible with one tap.
  const updated = await prisma.stakePosition.update({ where: { id }, data: { autoRenew: wantOn } });
  return NextResponse.json({ ok: true, data: serializePosition(updated) });
}
