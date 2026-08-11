export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { createStakePositionV2 } from '@/lib/stakingV2';
import { getCoinAuthority, CoinAuthorityBlockedError } from '@/lib/coinAuthority';
import { settleMaturedPositions } from '@/lib/staking';

// POST /api/staking/stake — lock funds into a V2 staking product.
//
// docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md §5.2①
// (CUT-4 / T-7), full rewrite per that table's row for this file:
//   ⓐ CP-2 (rev05 §3.2 ⓑ) — assertExecutionAllowed(coin, 'NEW_POSITION') runs
//      before any position is created. This route does NOT call it directly —
//      createStakePositionV2 (lib/stakingV2.ts, CUT-1/T-3, NOT reimplemented
//      here) already calls it as the very first thing it does, before opening
//      its transaction. Calling it again here would be redundant, not safer.
//   ⓑ Authority branch — every live staking product is BANA, and BANA is
//      always LOCAL-authority (N-6: "only BANA is stakeable"). The hub
//      balance call the pre-CS-1′ implementation used
//      (`niaWalletRequest('GET', '/api/v1/wallets', ...)`) is gone outright,
//      not merely unreached — createStakePositionV2's USER_BALANCE branch
//      only implements the LOCAL path (placeHold), by its own doc comment.
//      getCoinAuthority() is checked below as a fail-closed backstop against
//      that assumption changing under this route without a code review; it
//      is not expected to ever return non-LOCAL for a live product today.
//   ⓒ createStakePositionV2 creates the position AND places the
//      STAKE_PRINCIPAL_LOCK hold (placeHold) inside the SAME `prisma.$transaction`
//      — see that function's own doc comment ("create position -> create hold
//      with relatedId=position.id -> backfill principalHoldId", all one tx).
//      This route never opens its own transaction around the call.
//   ⓓ Capacity re-check against StakePositionV2 (not the legacy table) —
//      already inside createStakePositionV2.
//   ⓔ coin -> product -> user advisory lock order — already inside
//      createStakePositionV2 (see its lock-order note: this does not conflict
//      with the fail-closed legacy v1 route's product -> user order, since
//      the legacy route never acquires the coin lock).
//
// R-AR-2 (docs/specs/staking-v2-auto-renew-cutover-ruling.md §5.1) — checked
// FIRST, before any field/product/balance validation: the mere presence of an
// `autoRenew` key in the request body is rejected 409 AUTO_RENEW_UNAVAILABLE,
// value irrelevant. V2 has no renewal decision engine (deferred to T-20), so
// this is a REJECTION of the request shape, not a silent ignore of the field.

function err(e: unknown) {
  const x = e as Error & { status?: number; code?: string; params?: Record<string, string> };
  return NextResponse.json(
    { ok: false, error: x.message, code: x.code ?? 'GENERIC', ...(x.params ? { params: x.params } : {}) },
    { status: x.status ?? 500 },
  );
}

/**
 * Normalizes every error createStakePositionV2 (or its own placeHold/
 * assertExecutionAllowed calls) can throw into this route's `code`/`status`
 * response convention.
 *   - createStakePositionV2's own errors are already Object.assign'd with
 *     {code, status} (its internal `stakeError` helper) — passed through
 *     unchanged: STAKE_PRODUCT_NOT_FOUND, STAKE_PRODUCT_COIN_MISMATCH,
 *     STAKE_PRODUCT_CLOSED, STAKE_BELOW_MIN, STAKE_ABOVE_MAX,
 *     STAKE_PRODUCT_FULL, STAKE_INTEREST_LIABILITY_CAP_NOT_SET,
 *     STAKE_INTEREST_LIABILITY_CAP_EXCEEDED, STAKE_INVALID_AMOUNT.
 *   - CP-2's CoinAuthorityBlockedError has no {code,status} of its own (it
 *     carries `reason`/`symbol`) — mapped here to 403 + a STAKE_-prefixed
 *     code, the "403 + 사유 코드" CP-2 requires, using the same STAKE_
 *     namespace as every other code this route returns.
 *   - placeHold's insufficient-balance error (thrown inside
 *     createStakePositionV2's own transaction) carries only
 *     `code: 'INSUFFICIENT_AVAILABLE_BALANCE'`, no status — mapped to this
 *     route's STAKE_INSUFFICIENT_LOCAL_BALANCE / 400.
 */
function mapStakeError(e: unknown): Error & { code: string; status: number; params?: Record<string, string> } {
  if (e instanceof CoinAuthorityBlockedError) {
    const code =
      e.reason === 'T2_HALTED' ? 'STAKE_COIN_HALTED'
      : e.reason === 'T1_WARNING_NO_OVERRIDE' ? 'STAKE_COIN_T1_WARNING'
      : e.reason === 'DIRECT_CHANGE_IN_PROGRESS' ? 'STAKE_COIN_AUTHORITY_CHANGE_IN_PROGRESS'
      : 'STAKE_COIN_AUTHORITY_TRANSITION_IN_PROGRESS';
    return Object.assign(new Error(e.message), { code, status: 403 });
  }
  const x = e as Error & { code?: string; status?: number; params?: Record<string, string> };
  if (x.code === 'INSUFFICIENT_AVAILABLE_BALANCE') {
    return Object.assign(new Error(x.message), { code: 'STAKE_INSUFFICIENT_LOCAL_BALANCE', status: 400 });
  }
  if (x.code && x.status) return x as Error & { code: string; status: number; params?: Record<string, string> };
  return Object.assign(new Error(x.message ?? 'Unexpected error'), { code: x.code ?? 'GENERIC', status: x.status ?? 500 });
}

export async function POST(req: Request): Promise<NextResponse> {
  let dbUserId: string, email: string;
  try {
    await requireUser();
    const u = (await auth())?.user as { id?: string; email?: string } | undefined;
    if (!u?.id) throw Object.assign(new Error('Unauthorized'), { status: 401 });
    dbUserId = u.id; email = u.email ?? '';
  } catch (e) {
    return err(Object.assign(e as Error, { code: (e as { code?: string }).code ?? 'UNAUTHENTICATED' }));
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}

  // R-AR-2 — first, ahead of everything else (see doc comment above).
  if (Object.prototype.hasOwnProperty.call(body, 'autoRenew')) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Auto-renew is not available on V2 stakes yet.',
        code: 'AUTO_RENEW_UNAVAILABLE',
      },
      { status: 409 },
    );
  }

  const productId = String(body.productId ?? '');

  let amount: Decimal;
  try {
    amount = new Decimal(String(body.amount ?? ''));
    if (!amount.isFinite() || amount.lte(0)) throw new Error('bad');
  } catch {
    return NextResponse.json({ ok: false, error: 'Enter a valid amount greater than 0', code: 'STAKE_INVALID_AMOUNT' }, { status: 400 });
  }

  const product = await prisma.stakingProductV2.findUnique({ where: { id: productId }, select: { id: true, coin: true } });
  if (!product) {
    return NextResponse.json({ ok: false, error: 'Staking product not found', code: 'STAKE_PRODUCT_NOT_FOUND' }, { status: 404 });
  }

  // ⓑ — fail-closed backstop, see doc comment above.
  const authority = await getCoinAuthority(product.coin);
  if (authority !== 'LOCAL') {
    return NextResponse.json(
      {
        ok: false,
        error: `${product.coin} staking is not available through this path.`,
        code: 'STAKE_COIN_AUTHORITY_UNSUPPORTED',
      },
      { status: 503 },
    );
  }

  // Lazy-settle first, so a just-matured position's hold is released (and its
  // principal becomes available again) before this request's own available-
  // balance check runs inside createStakePositionV2 — same ordering the
  // legacy route used (`settleMaturedPositions` before its balance read).
  await settleMaturedPositions(dbUserId);

  try {
    const created = await createStakePositionV2({
      userId: dbUserId,
      email,
      coin: product.coin,
      productId: product.id,
      principal: amount.toFixed(),
      fundingSource: 'USER_BALANCE',
    });
    return NextResponse.json({ ok: true, data: { id: created.id, maturityAt: created.maturityAt } });
  } catch (e) {
    return err(mapStakeError(e));
  }
}
