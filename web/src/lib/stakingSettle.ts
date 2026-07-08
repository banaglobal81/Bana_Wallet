import 'server-only';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db';
import { daysElapsed, dailyInterest } from '@/lib/stakingMath';
import { payReferralBonuses, type ReferralBonusRunResult } from '@/lib/referralBonus';

export interface SettlementResult {
  processed: number;
  matured: number;
  daysCredited: number;
  totalPaid: string;
  at: string;
  referral: ReferralBonusRunResult; // MLM commission run (no-op unless enabled)
}

// The daily staking settlement. For every ACTIVE position it PAYS the interest
// earned for each elapsed day that hasn't been paid yet — one auditable row per
// day in StakingPayout — then flips matured positions to MATURED (which unlocks
// the principal). Idempotent: re-running pays nothing twice (days tracked by
// daysPaid + the unique [positionId, dayIndex]). Shared by the cron endpoint
// and the admin "run now" action so both behave identically.
export async function runStakingSettlement(now: Date = new Date()): Promise<SettlementResult> {
  let processed = 0;
  let matured = 0;
  let daysCredited = 0;
  let totalPaid = new Decimal(0);

  // ACTIVE positions, plus any that were matured WITHOUT being fully paid (a
  // lazily-matured row has status MATURED but paidAt=null — the settlement job
  // always stamps paidAt when it matures). Picking those up self-heals any days
  // that a premature unlock would otherwise have stranded.
  const positions = await prisma.stakePosition.findMany({
    where: { OR: [{ status: 'ACTIVE' }, { status: 'MATURED', paidAt: null }] },
    select: {
      id: true, userId: true, coin: true, principal: true,
      dailyRatePct: true, termDays: true, startAt: true, daysPaid: true,
    },
  });

  for (const p of positions) {
    const dueDays = daysElapsed(p.startAt, now, p.termDays);
    const perDay = dailyInterest(p.principal, p.dailyRatePct);
    const newDays = dueDays - p.daysPaid;

    if (newDays > 0) {
      const rows = [];
      for (let d = p.daysPaid + 1; d <= dueDays; d += 1) {
        rows.push({ positionId: p.id, userId: p.userId, coin: p.coin, amount: perDay.toFixed(), dayIndex: d });
      }
      await prisma.stakingPayout.createMany({ data: rows, skipDuplicates: true });

      const paidToDate = perDay.times(dueDays);
      const isDone = dueDays >= p.termDays;
      await prisma.stakePosition.update({
        where: { id: p.id },
        data: {
          daysPaid: dueDays,
          paidInterest: paidToDate.toFixed(),
          accruedInterest: paidToDate.toFixed(),
          lastAccrualAt: now,
          ...(isDone ? { status: 'MATURED', paidAt: now } : {}),
        },
      });

      daysCredited += newDays;
      totalPaid = totalPaid.plus(perDay.times(newDays));
      if (isDone) matured += 1;
    } else if (dueDays >= p.termDays) {
      await prisma.stakePosition.update({
        where: { id: p.id },
        data: { status: 'MATURED', paidAt: now, lastAccrualAt: now },
      });
      matured += 1;
    }
    processed += 1;
  }

  // MLM referral commission for this settlement day — runs after base interest is
  // credited (bonuses are a % of that interest). No-op unless REFERRAL_BONUS_ENABLED.
  const referral = await payReferralBonuses(now);

  return { processed, matured, daysCredited, totalPaid: totalPaid.toFixed(), at: now.toISOString(), referral };
}
