export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/session';
import { settleMaturedPositionsV2 } from '@/lib/stakingV2';
import { aprPct } from '@/lib/stakingMath';
import { AUTO_RENEW_MAX_TERM_DAYS } from '@/lib/stakingRenewMath';

// docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md §5.1 CUT-2 /
// T-5:
//   - GET now reads StakePositionV2 (was StakePosition).
//   - POST (the admin grant route) is PERMANENTLY REMOVED, not just fail-closed.
//     CS-1′ (rev05 §2.2) made it 409 GRANT_DISABLED_V2_CORE as an interim measure
//     "until CUT-2/CUT-3/CUT-4 replace it with a V2 implementation" — rev04 §1.8
//     G-E ("V2-CORE에서 그랜트 기능은 제공하지 않는다") is the actual, permanent
//     policy, so CUT-2 removes the handler outright rather than replacing it with a
//     V2 grant implementation. There is no POST export in this file; calling
//     POST here now gets Next.js's default 405, not a 409 JSON body — that is the
//     intended outcome, not an oversight.
//   - `StakePositionV2Status` has no PAID member (schema.prisma) — there is no
//     legacy PAID-state concept to carry forward into the response shape below.

// Serialize a StakePositionV2 row for the admin oversight table. Distinct from
// web/src/lib/staking.ts's serializePosition (v1) — that function's `accruedInterest`
// field is a banned concept in V2 (rev05 §5.2 ① — "V2에는 컬럼 자체가 없고 개념이
// 금지됨", A-4 principles 2/6 F-C fix): V2 only ever exposes what has actually been
// ledgered (`ledgeredYield`), never a live client-side projection computed here.
interface SerializablePositionV2 {
  id: string;
  productId: string;
  coin: string;
  principal: string;
  baseDailyRatePct: string;
  termDays: number;
  startAt: Date;
  maturityAt: Date;
  status: string;
  ledgeredYield: string;
  daysPaid: number;
  autoRenew: boolean;
  renewalStatus: string;
  renewedIntoPositionId: string | null;
  renewedFromPositionId: string | null;
  grantedByAdminId: string | null;
  fundingSource: string;
  email: string;
  product: { name: string } | null;
}

function serializePositionV2(p: SerializablePositionV2) {
  return {
    id: p.id,
    productId: p.productId,
    coin: p.coin,
    principal: p.principal,
    baseDailyRatePct: p.baseDailyRatePct,
    aprPct: aprPct(p.baseDailyRatePct).toFixed(2),
    termDays: p.termDays,
    startAt: p.startAt.toISOString(),
    maturityAt: p.maturityAt.toISOString(),
    status: p.status,
    // Real amounts credited by the settlement engine (the yield ledger) — renamed
    // from v1's paidInterest, same "unpaid, ledger-only" meaning (nothing has ever
    // been sent to a Nia-Hub balance — no payout rail exists, staking-yield-system
    // -v2-prd.md §4).
    ledgeredYield: p.ledgeredYield,
    daysPaid: p.daysPaid,
    autoRenew: p.autoRenew,
    renewalStatus: p.renewalStatus,
    renewedIntoPositionId: p.renewedIntoPositionId,
    renewedFromPositionId: p.renewedFromPositionId,
    autoRenewEligible: p.termDays <= AUTO_RENEW_MAX_TERM_DAYS && p.grantedByAdminId == null,
    email: p.email,
    productName: p.product?.name ?? '',
    // admin-staking-debt-visibility-frd.md §4.4 P-5 — derived server-side (admin
    // route only). PLATFORM_GRANT is structurally unreachable today (CS-1′ blocked
    // v1 grants permanently; rev04 G-E means V2 never gained a grant creation path
    // either), but the field/flag stay wired for any pre-cutover historical grant
    // row and for forward-compat if H-2 policy ever changes.
    isGrant: p.fundingSource === 'PLATFORM_GRANT',
  };
}

// GET /api/admin/staking/positions — all V2 stake positions (oversight).
export async function GET(): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  await settleMaturedPositionsV2();

  const rows = await prisma.stakePositionV2.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { product: { select: { name: true } } },
  });

  const data = rows.map(serializePositionV2);
  return NextResponse.json({ ok: true, data });
}
