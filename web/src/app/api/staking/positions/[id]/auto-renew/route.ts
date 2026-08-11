export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { serializePositionV2 } from '@/lib/staking';
import { AUTO_RENEW_MAX_TERM_DAYS } from '@/lib/stakingRenewMath';

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, error, code }, { status });
}

// AUTO_RENEW_V2_ENABLED (docs/specs/staking-v2-auto-renew-cutover-ruling.md
// §4, R-AR-1) — the SAME named code constant `lib/stakingV2.ts` defines for
// `sendMaturityRemindersV2`, deliberately re-declared here rather than
// imported/exported across that module boundary: this route's check 6 (below)
// needs a plain boolean it can compare against `wantOn`, not stakingV2.ts's
// internal (non-exported) constant. Both must be edited together if this
// value ever changes — that pairing is exactly R-AR-1's point ("policy value
// this consequential must not be a lever anyone can flip without a code
// change and review... it makes 'turn the promise on' and 'build the thing
// that keeps the promise' the same act").
const AUTO_RENEW_V2_ENABLED = false;

/**
 * PATCH /api/staking/positions/[id]/auto-renew — flip the caller's standing
 * auto-renew instruction on a V2 position they own.
 *
 * docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md §5.2①
 * (CUT-4 / T-7) carries forward "V2 position ownership + AUTO_RENEW_MAX_TERM_DAYS"
 * unchanged, and docs/specs/staking-v2-auto-renew-cutover-ruling.md §5.1 (R-AR-2)
 * inserts ONE new check — its own numbered check 6 — between the existing
 * status check (5) and the existing grant/term-cap checks (7/8):
 *
 *   1 requireUser() + session identity           — unchanged
 *   2 body shape                                  — unchanged
 *   3 exists + owned by caller (both 404)          — unchanged
 *   4 idempotent short-circuit (autoRenew===wantOn)— unchanged, BEFORE 5-8
 *   5 status === 'ACTIVE'                          — unchanged (409 POSITION_NOT_ACTIVE)
 *   6 AUTO_RENEW_V2_ENABLED===false && wantOn===true → 409 AUTO_RENEW_UNAVAILABLE (NEW)
 *   7 grantedByAdminId != null                     — unchanged (409 AUTO_RENEW_GRANTED_POSITION)
 *   8 termDays > AUTO_RENEW_MAX_TERM_DAYS           — unchanged (409 AUTO_RENEW_TERM_TOO_LONG)
 *
 * Two things the ruling requires explicitly, both preserved here:
 *   ⓐ The off-ramp (`{autoRenew:false}`) and the idempotent short-circuit (4)
 *      are NEVER gated by check 6 (or by anything else) — M-3
 *      ("끄는 스위치는 결코 게이트하지 않는다") applies exactly as much with
 *      the engine missing as it did with the legacy engine present. Turning
 *      auto-renew off (or a no-op re-request of the state a position is
 *      already in) on an ACTIVE position must always succeed.
 *   ⓑ Check 6 is positioned BEFORE 7/8, not after — telling a caller "this
 *      stake was granted by BANA" or "this stake's term is too long" when
 *      NO position can have auto-renew turned on right now, for any reason,
 *      would be false specificity (the ruling's §5.1 ⓑ: "보편적인 사유를
 *      개별적인 사유보다 먼저").
 *
 * `AUTO_RENEW_MAX_TERM_DAYS`'s check itself is UNREACHABLE while
 * AUTO_RENEW_V2_ENABLED is false (check 6 always returns first for any
 * wantOn===true request) — this is deliberately left as dead code, not
 * removed, per that ruling's explicit "삭제 금지" (T-20 is the only track
 * that may re-enable it).
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
  const position = await prisma.stakePositionV2.findUnique({ where: { id } });
  if (!position || position.userId !== dbUserId) {
    return fail(404, 'POSITION_NOT_FOUND', 'Stake not found.');
  }

  // 4 — idempotency short-circuit, BEFORE the eligibility checks (5-8). A
  // no-op { autoRenew: false } (or a repeat of the state a position is
  // already in) must return 200, not 409 — refusing a request for the state
  // the row is already in would be theatre. Never gated (ruling §5.1 ⓐ).
  if (position.autoRenew === wantOn) {
    return NextResponse.json({ ok: true, data: serializePositionV2(position) });
  }

  // 5 — must be ACTIVE to change at all (applies to both directions).
  if (position.status !== 'ACTIVE') {
    return fail(409, 'POSITION_NOT_ACTIVE', 'This stake has already matured — auto-renew can no longer be changed.');
  }

  // 6 — R-AR-2 (NEW). On-ramp only: turning OFF (wantOn===false) always
  // reaches here already having returned above via 4 for every reachable V2
  // position (autoRenew is never true on any supported path), and if it ever
  // is true it must still be turnable off — so this check applies
  // exclusively to wantOn===true, per the ruling.
  if (wantOn && !AUTO_RENEW_V2_ENABLED) {
    return fail(
      409,
      'AUTO_RENEW_UNAVAILABLE',
      'Auto-renew is not available on V2 stakes yet. Your principal will always return to your wallet at maturity.',
    );
  }

  // 7/8 — on-ramp only. Distinct messages by design (copy-spec §2.3): the cap
  // refusal is actionable/general, the grant refusal is not and is specific
  // to this position — a shared string would give both users the same
  // non-answer. Unreachable today (6 above always returns first while
  // AUTO_RENEW_V2_ENABLED is false) — kept per the ruling's "삭제 금지".
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
  const updated = await prisma.stakePositionV2.update({ where: { id }, data: { autoRenew: wantOn } });
  return NextResponse.json({ ok: true, data: serializePositionV2(updated) });
}
