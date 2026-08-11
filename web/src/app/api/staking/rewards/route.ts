export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';

// GET /api/staking/rewards — the user's earned V2 staking-interest rewards ledger.
//
// docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md §5.2①
// (CUT-4 / T-7): `stakingPayout` -> `stakeYieldLedgerEntry`, `paidAt` ->
// `settledAt` (both the DB column read and the JSON field returned, for
// consistency with every other V2-renamed field this cutover touches).
// `totalByCoin` now sums `StakePositionV2.ledgeredYield` (the same
// incrementally-maintained cache `runStakingSettlementV2` writes — A-4
// principles 2/6 F-C fix — never a fresh SUM of ledger rows here) instead of
// v1's `paidInterest`.
//
// The four pagination MODES below are UNCHANGED from the legacy route — this
// was an explicit requirement (rev05 §5.2①: "since/positionId/cursor/limit 4개
// 모드의 페이지네이션 의미를 정확히 보존" — Field Log/Shift Report depend on it):
// Always returns `totalByCoin` (credited-to-date per coin, from the position rows).
//
// The `payouts` page is shaped by three optional, independent query params:
//   - (none)                → legacy/default: the caller's most recent payouts across
//                             all positions, newest first. Default page size 20.
//   - `since=<ISO date>`    → every payout credited to the caller strictly after that
//                             timestamp, un-merged (one row per staking-day), oldest
//                             first — for a catch-up read. Default page size 50.
//   - `positionId=<id>`     → the full payout ledger for one position (ownership is
//                             verified against the session), oldest day first. Default
//                             page size 50.
// `since` and `positionId` may be combined (AND'ed). `cursor` (a payout id from a
// previous page's `nextCursor`) + `limit` (max 200) page through any of the above.
// Truncation is never silent: `hasMore` / `nextCursor` / `total` are always returned.
export async function GET(req: NextRequest): Promise<NextResponse> {
  let userId: string;
  try {
    await requireUser();
    const u = (await auth())?.user as { id?: string } | undefined;
    if (!u?.id) throw Object.assign(new Error('Unauthorized'), { status: 401 });
    userId = u.id;
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  const params = req.nextUrl.searchParams;
  const sinceRaw = params.get('since');
  const positionId = params.get('positionId') || undefined;
  const cursor = params.get('cursor') || undefined;
  const limitRaw = params.get('limit');

  let since: Date | undefined;
  if (sinceRaw) {
    since = new Date(sinceRaw);
    if (Number.isNaN(since.getTime())) {
      return NextResponse.json({ ok: false, error: 'Invalid `since` timestamp' }, { status: 400 });
    }
  }

  const wideMode = Boolean(since || positionId);
  const defaultLimit = wideMode ? 50 : 20;
  const MAX_LIMIT = 200;
  let limit = defaultLimit;
  if (limitRaw) {
    const n = Number.parseInt(limitRaw, 10);
    if (!Number.isFinite(n) || n < 1) {
      return NextResponse.json({ ok: false, error: 'Invalid `limit`' }, { status: 400 });
    }
    limit = Math.min(n, MAX_LIMIT);
  }

  // D2: verify the position belongs to the caller before scoping the ledger to it.
  // Identity is derived from the session throughout — never from the client (rule 8).
  if (positionId) {
    const owned = await prisma.stakePositionV2.findFirst({
      where: { id: positionId, userId },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json({ ok: false, error: 'Position not found' }, { status: 404 });
    }
  }

  const positions = await prisma.stakePositionV2.findMany({
    where: { userId },
    select: { coin: true, ledgeredYield: true },
  });
  const totalByCoin: Record<string, string> = {};
  for (const p of positions) {
    totalByCoin[p.coin] = new Decimal(totalByCoin[p.coin] ?? 0).plus(p.ledgeredYield || '0').toFixed();
  }

  const where = {
    userId,
    ...(positionId ? { positionId } : {}),
    ...(since ? { settledAt: { gt: since } } : {}),
  };

  // Ordering: per-position ledgers read chronologically by day; a `since` catch-up
  // reads oldest-missed-first; the legacy default reads newest-first. `id` is a
  // stable tiebreaker so cursor pagination never skips/repeats a row.
  const orderBy = positionId
    ? ([{ dayIndex: 'asc' }, { id: 'asc' }] as const)
    : since
      ? ([{ settledAt: 'asc' }, { id: 'asc' }] as const)
      : ([{ settledAt: 'desc' }, { id: 'desc' }] as const);

  const [rows, total] = await Promise.all([
    prisma.stakeYieldLedgerEntry.findMany({
      where,
      orderBy: orderBy as any,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit + 1,
      select: { id: true, coin: true, amount: true, dayIndex: true, settledAt: true, positionId: true },
    }),
    prisma.stakeYieldLedgerEntry.count({ where }),
  ]);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  return NextResponse.json({
    ok: true,
    data: {
      totalByCoin,
      payouts: page.map((r) => ({
        id: r.id,
        coin: r.coin,
        amount: r.amount,
        dayIndex: r.dayIndex,
        settledAt: r.settledAt.toISOString(),
        positionId: r.positionId,
      })),
      hasMore,
      nextCursor,
      total,
    },
  });
}
