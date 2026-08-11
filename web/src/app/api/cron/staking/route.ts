export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { runStakingSettlementV2 } from '@/lib/stakingV2';
import { getPlatformSettings } from '@/lib/platformSettings';

// POST /api/cron/staking — the daily settlement job, called by the persistent
// worker (worker/trigger.mjs). Protected by a shared secret (x-cron-secret).
//
// docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md §5.1
// CUT-3 (T-6): this endpoint now runs the V2 engine (`runStakingSettlementV2`,
// lib/stakingV2.ts) instead of the legacy `runStakingSettlement`
// (lib/stakingSettle.ts, still called separately by
// api/admin/staking/run/route.ts's own "run now" action — untouched here,
// out of this file's scope). CP-9: `payReferralBonuses` is now called from
// INSIDE `runStakingSettlementV2` (same relative position as the legacy
// engine's last line) — this route no longer calls it directly.
//
// Server-side gate (defense in depth, on top of the worker's own
// `schedule.enabled` check from GET below): execution requires
// `stakingV2WorkerEnabled=true`. When it's false this returns 200 with
// `skipped:true` rather than an error, so the worker's poll loop doesn't log
// a failure every cycle while the flag is intentionally off.
//
// wallet-security-expert review (rev05 CUT-3, T-6 rejection fix): the
// skipped:true 200 above is only harmless if the legacy `StakePosition`
// table has zero ACTIVE rows — CS-2′ (rev05 §5.0) confirmed that as a fact
// checked by a human once, but this route no longer calls the legacy
// `runStakingSettlement` engine at all, so nothing here re-verified it on an
// ongoing basis. Without that check, the deploy window before
// `prisma-db-expert` flips `stakingWorkerEnabled=false` /
// `stakingV2WorkerEnabled=true` on the production singleton row would report
// silent 200 OK health while NEITHER engine settles a legacy position — the
// exact "hold that never releases at maturity, user never notified" failure
// rev05 §5.1 P-27 names as the highest-risk defect this cutover exists to
// avoid. The guard below promotes CS-2′ from a one-time human check into an
// invariant this route enforces every single cycle, regardless of which
// branch below would otherwise run — it fails LOUD (500 + console.error),
// never silently, and blocks execution of either branch until the invariant
// is restored.
export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 503 });
  }
  if (req.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const legacyActive = await prisma.stakePosition.count({ where: { status: 'ACTIVE' } });
  if (legacyActive > 0) {
    console.error(
      `[cron/staking] CS-2' INVARIANT VIOLATION: ${legacyActive} legacy StakePosition row(s) are still ACTIVE. ` +
      'The rev05 CUT-3 cutover assumed this count was zero and this endpoint no longer calls the legacy ' +
      'settlement engine at all — those positions are receiving NO interest settlement and, once matured, their ' +
      'principal holds will never release (rev05 §5.1 P-27). Refusing to report a silent 200 skipped/settled ' +
      'while this invariant is violated. Escalate to prisma-db-expert/deploy-manager immediately.',
    );
    return NextResponse.json(
      {
        ok: false,
        error: `${legacyActive} legacy StakePosition row(s) are still ACTIVE — settlement halted (see server logs).`,
        code: 'LEGACY_POSITIONS_UNSETTLED',
      },
      { status: 500 },
    );
  }

  const settings = await getPlatformSettings();
  if (!settings.stakingV2WorkerEnabled) {
    return NextResponse.json({ ok: true, data: { skipped: true, reason: 'stakingV2WorkerEnabled is false' } });
  }

  const result = await runStakingSettlementV2(new Date());
  return NextResponse.json({ ok: true, data: result });
}

// GET — health check + schedule config, polled by the persistent worker loop
// each cycle so admin-panel schedule changes take effect without a redeploy
// (still requires the secret). Schedule now reads the `stakingV2Worker*`
// settings (rev05 CUT-3) — `enabled` mirrors the same flag POST gates on
// above, so the worker's own skip-if-disabled behavior and this route's
// server-side gate can never disagree. Active-position count is now
// `StakePositionV2` (rev05 §5.2 ①: "stakePosition.count → V2").
export async function GET(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const active = await prisma.stakePositionV2.count({ where: { status: 'ACTIVE' } });
  const settings = await getPlatformSettings();
  return NextResponse.json({
    ok: true,
    data: {
      activePositions: active,
      schedule: {
        enabled: settings.stakingV2WorkerEnabled,
        mode: settings.stakingV2WorkerMode,
        intervalMinutes: settings.stakingV2WorkerIntervalMinutes,
        dailyTime: settings.stakingV2WorkerDailyTime,
      },
    },
  });
}
