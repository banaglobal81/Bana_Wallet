export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit';
import { runStakingSettlementV2 } from '@/lib/stakingV2';

function adminErr(e: unknown) {
  const err = e as Error & { status?: number };
  return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
}

// POST /api/admin/staking/run — run the daily settlement now (admin-triggered).
// CUT-3 (docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md
// §5.1): same V2 engine (SETTLE-1/SETTLE-2) the cron worker uses; idempotent
// (insert-then-increment + @@unique([positionId, dayIndex])), so it's safe to
// press anytime. Referral-bonus / reminder-email relocation is out of this
// route's scope (handled at /api/cron/staking) — this endpoint is the base
// interest engine only.
//
// wallet-security-expert non-blocking follow-up (rev05 CUT-3, T-6 fix review
// of api/cron/staking): that route now enforces CS-2′ (legacy `StakePosition`
// has zero ACTIVE rows) on every cycle rather than trusting the one-time human
// check. Same invariant applies here — this endpoint never calls the legacy
// engine either, so a legacy ACTIVE row would silently receive no interest
// and never mature. Unlike the cron route (silent scheduled 200), this is an
// admin pressing a button, so the guard responds with a 409 the admin can
// read and act on, not a bare 500.
export async function POST(): Promise<NextResponse> {
  let admin;
  try { admin = await requireAdmin(); } catch (e) { return adminErr(e); }

  const legacyActive = await prisma.stakePosition.count({ where: { status: 'ACTIVE' } });
  if (legacyActive > 0) {
    console.error(
      `[admin/staking/run] CS-2' INVARIANT VIOLATION: ${legacyActive} legacy StakePosition row(s) are still ` +
      'ACTIVE. This endpoint only runs the V2 settlement engine — those positions receive no interest and, once ' +
      'matured, their principal holds will never release (rev05 §5.1 P-27). Refusing to run V2 settlement while ' +
      'this invariant is violated. Escalate to prisma-db-expert/deploy-manager immediately.',
    );
    return NextResponse.json(
      {
        ok: false,
        error: `${legacyActive} legacy staking position(s) are still ACTIVE and are not covered by this settlement engine. Settlement was not run — escalate to engineering before retrying.`,
        code: 'LEGACY_POSITIONS_UNSETTLED',
      },
      { status: 409 },
    );
  }

  const result = await runStakingSettlementV2(new Date());
  await recordAudit({
    adminId: (admin as { id?: string }).id, adminEmail: (admin as { email?: string }).email,
    action: 'STAKING_SETTLEMENT_RUN', targetType: 'staking', targetId: null,
    // skippedHalted (SETTLE-2): positions whose coin is T2_HALTED were skipped,
    // not errored — surfaced here so the audit trail doesn't read as if every
    // active position settled cleanly.
    detail: `Ran V2 settlement: ${result.daysCredited} day(s) credited, ${result.totalLedgered} ledgered, ${result.matured} matured, ${result.skippedHalted} skipped (halted) across ${result.processed} position(s)`,
  });
  return NextResponse.json({ ok: true, data: result });
}

// GET /api/admin/staking/run — settlement status: when interest was last ledgered,
// how much was ledgered today, and how many V2 positions are active.
export async function GET(): Promise<NextResponse> {
  try { await requireAdmin(); } catch (e) { return adminErr(e); }

  const last = await prisma.stakeYieldLedgerEntry.findFirst({ orderBy: { settledAt: 'desc' }, select: { settledAt: true } });

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todays = await prisma.stakeYieldLedgerEntry.findMany({
    where: { settledAt: { gte: startOfToday } },
    select: { amount: true },
  });
  const totalLedgeredToday = todays.reduce((sum, r) => sum.plus(new Decimal(r.amount)), new Decimal(0));

  const activeCount = await prisma.stakePositionV2.count({ where: { status: 'ACTIVE' } });

  return NextResponse.json({
    ok: true,
    data: {
      lastLedgeredAt: last?.settledAt ? last.settledAt.toISOString() : null,
      ledgerEntriesToday: todays.length,
      totalLedgeredToday: totalLedgeredToday.toFixed(),
      activeCount,
    },
  });
}
