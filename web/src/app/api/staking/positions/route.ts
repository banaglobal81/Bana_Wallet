export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { settleMaturedPositions, lockedPrincipalByCoin, serializePositionV2 } from '@/lib/staking';
import { getDeepCoreState } from '@/lib/deepCoreProgress';

// GET /api/staking/positions — the signed-in user's V2 stake positions.
//
// docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md §5.2①
// (CUT-4 / T-7): reads `StakePositionV2` (was `StakePosition`). Serialization
// is `lib/staking.ts`'s `serializePositionV2` — shared with
// api/staking/positions/[id]/auto-renew/route.ts so both routes' JSON shape
// can never drift apart; see that function's own doc comment for the full
// v1 -> V2 field-by-field rationale (accruedInterest deleted, paidInterest ->
// ledgeredYield, dailyRatePct -> baseDailyRatePct, no 'PAID' status).
//
// Also returns a `game` block (DEEP CORE Phase 0 — docs/specs/deep-core-05-screen-flow-frd.md
// G-7: the game surface must not add its own polling / API round trips, so its
// derived state rides along on the request the page already makes on every
// `load()`). `game` derivation is best-effort: any failure there must never
// break the real (money-adjacent) positions read, so it's wrapped and
// degrades to `null` — the client-side game surface then falls back to its
// own "could not load" state (R-5 / GAME_LOAD_FAILED) while the rest of the
// page works normally.
export async function GET(): Promise<NextResponse> {
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

  await settleMaturedPositions(dbUserId);

  const rows = await prisma.stakePositionV2.findMany({
    where: { userId: dbUserId },
    orderBy: { createdAt: 'desc' },
    include: { product: { select: { name: true } } },
  });

  const data = rows.map((p) => ({ ...serializePositionV2(p), productName: p.product?.name ?? '' }));

  let game = null;
  try {
    game = await getDeepCoreState(dbUserId);
  } catch (e) {
    console.error('[deep-core] state derivation failed for user', dbUserId, e);
  }

  // docs/specs/staking-page-v2-screen-flow-frd.md §4.2.2 ③ / R-D2 — the
  // single source of truth for "locked principal" per coin. This is the
  // EXACT SAME function the withdrawal route calls (web/src/app/api/nia/withdrawals/route.ts)
  // to compute the withdrawal lock, so the number shown here can never drift
  // from what actually blocks a withdrawal. The client must not recompute
  // this by summing positions itself (that was the bug — see the report to
  // the parent agent).
  //
  // rev05 §5.2① (A-7 LB-C1): for a LOCAL-authority coin this is summed from
  // ACTIVE LocalBalanceHold(STAKE_PRINCIPAL_LOCK) rows (lib/staking.ts's
  // `lockedPrincipalByCoin` already delegates to stakingV2.ts's
  // `lockedPrincipalForLocal` since CUT-3/T-6) — NOT a sum of
  // StakePositionV2.principal directly, which would double-count once A-3
  // holds are the source of truth for `available`.
  const lockedMap = await lockedPrincipalByCoin(dbUserId);
  const lockedPrincipal: Record<string, string> = {};
  for (const [coin, amt] of lockedMap) lockedPrincipal[coin] = amt.toFixed();

  return NextResponse.json({ ok: true, data, game, lockedPrincipal });
}
