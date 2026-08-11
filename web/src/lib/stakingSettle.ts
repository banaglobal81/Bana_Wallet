import 'server-only';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db';
import { daysElapsed, dailyInterest, DAY_MS } from '@/lib/stakingMath';
import { payReferralBonuses, type ReferralBonusRunResult } from '@/lib/referralBonus';
import { matureOrRenewPosition, sendRenewalOutcomeIfNeeded } from '@/lib/stakingRenew';
import { reminderLeadMs } from '@/lib/stakingRenewMath';
import { sendMaturityReminderEmail } from '@/lib/email/resend';

export interface SettlementResult {
  processed: number;
  matured: number;
  // Auto-renew outcome counts (docs/specs/staking-auto-renew-prd.md §6.3).
  renewed: number;
  renewalsFailed: number;
  // A4-C1 (docs/specs/staking-auto-renew-assumption-ruling.md §4): a
  // RENEWAL_DEFERRED outcome (a transient failure inside
  // matureOrRenewPosition, retried up to MAX_RENEWAL_ATTEMPTS times) must be
  // visible to operators — it is the one auto-renew outcome that leaves a
  // matured user's principal unavailable (daysPaid capped at termDays, no
  // further interest) while looking, on this result object, like nothing
  // happened at all. Surface this wherever `matured`/`renewalsFailed` are
  // surfaced.
  renewalsDeferred: number;
  daysCredited: number;
  totalPaid: string;
  at: string;
  referral: ReferralBonusRunResult; // MLM commission run (no-op unless enabled)
}

// reminderLeadMs moved to stakingRenewMath.ts (rev05 CUT-3, T-6) — see that
// file's doc comment. Both this legacy engine and stakingV2.ts's
// runStakingSettlementV2 now import the single shared table.

// The daily staking settlement. For every ACTIVE position it PAYS the interest
// earned for each elapsed day that hasn't been paid yet — one auditable row per
// day in StakingPayout — then, once every day is paid, hands the maturity
// decision (plain maturity or renew) to `matureOrRenewPosition` — the ONLY
// code permitted to flip a position to MATURED (docs/specs/staking-auto-renew-prd.md
// §6.2/§6.3). Idempotent: re-running pays nothing twice (days tracked by
// daysPaid + the unique [positionId, dayIndex]) and never re-matures/re-renews
// a position (matureOrRenewPosition's own conditional-flip guard). Shared by
// the cron endpoint and the admin "run now" action so both behave identically.
export async function runStakingSettlement(now: Date = new Date()): Promise<SettlementResult> {
  let processed = 0;
  let matured = 0;
  let renewed = 0;
  let renewalsFailed = 0;
  let renewalsDeferred = 0;
  let daysCredited = 0;
  let totalPaid = new Decimal(0);

  // --- Pass 1: credit payouts, then mature/renew every position whose term is due ---
  const positions = await prisma.stakePosition.findMany({
    where: { status: 'ACTIVE' },
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
      // Step 1 (PRD §6.3): credit payouts + daysPaid/paidInterest/accruedInterest
      // /lastAccrualAt — do NOT touch `status` here. The maturity flip (step 2)
      // is entirely `matureOrRenewPosition`'s job, so the settlement path and
      // the lazy path are identical by construction (AC-19).
      await prisma.stakePosition.update({
        where: { id: p.id },
        data: {
          daysPaid: dueDays,
          paidInterest: paidToDate.toFixed(),
          accruedInterest: paidToDate.toFixed(),
          lastAccrualAt: now,
        },
      });

      daysCredited += newDays;
      totalPaid = totalPaid.plus(perDay.times(newDays));
    }

    // Step 2: once every day of the term is paid, hand the maturity decision
    // to the single shared entry point.
    if (dueDays >= p.termDays) {
      const result = await matureOrRenewPosition(p.id, now);
      if (result.outcome === 'RENEWED') { matured += 1; renewed += 1; }
      else if (result.outcome === 'RENEWAL_FAILED') { matured += 1; renewalsFailed += 1; }
      else if (result.outcome === 'MATURED_NO_RENEWAL') { matured += 1; }
      else if (result.outcome === 'RENEWAL_DEFERRED') { renewalsDeferred += 1; }
      // ALREADY_HANDLED: another writer (the lazy path) got there first this
      // cycle — already counted when it ran, don't double-count here.
      // RENEWAL_DEFERRED does NOT increment `matured` — the position is
      // still ACTIVE (A4-C1): it stays past maturityAt, unpaid, principal
      // unavailable, until a later cycle either renews or forces
      // FAILED_SYSTEM.
    }
    processed += 1;
  }

  // Self-healing branch, retained per PRD §6.3: a MATURED row that somehow
  // never got fully paid (paidAt set but daysPaid < termDays). Under the
  // current writers this shouldn't occur — matureOrRenewPosition always
  // stamps paidAt exactly when it matures a position — but is kept as a
  // defensive catch-up for legacy rows / a direct DB edit.
  const unpaidMatured = await prisma.stakePosition.findMany({
    where: { status: 'MATURED', paidAt: null },
    select: {
      id: true, userId: true, coin: true, principal: true,
      dailyRatePct: true, termDays: true, startAt: true, daysPaid: true,
    },
  });
  for (const p of unpaidMatured) {
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
      await prisma.stakePosition.update({
        where: { id: p.id },
        data: { daysPaid: dueDays, paidInterest: paidToDate.toFixed(), accruedInterest: paidToDate.toFixed(), lastAccrualAt: now, paidAt: now },
      });
      daysCredited += newDays;
      totalPaid = totalPaid.plus(perDay.times(newDays));
    }
    processed += 1;
  }

  // --- Pass 2: pre-maturity reminders (PRD §7.1, M-1 — mandatory ship condition) ---
  const reminderCandidates = await prisma.stakePosition.findMany({
    where: { status: 'ACTIVE', autoRenew: true, maturityReminderSentAt: null, maturityAt: { gt: now } },
    select: {
      id: true, userId: true, coin: true, principal: true, termDays: true, maturityAt: true,
      product: { select: { name: true } },
    },
  });
  for (const p of reminderCandidates) {
    // "Never late" (PRD §7.1): maturityAt > now is already enforced by the
    // query above; additionally only send once inside the lead window.
    const lead = reminderLeadMs(p.termDays, DAY_MS);
    if (p.maturityAt.getTime() - now.getTime() > lead) continue;

    const user = await prisma.user.findUnique({ where: { id: p.userId }, select: { email: true, locale: true } });
    if (!user?.email) continue;

    try {
      await sendMaturityReminderEmail(user.email, user.locale, {
        productName: p.product?.name ?? '',
        principal: p.principal,
        coin: p.coin,
        termDays: p.termDays,
        maturityAt: p.maturityAt,
      });
      await prisma.stakePosition.update({ where: { id: p.id }, data: { maturityReminderSentAt: now } });
    } catch (e) {
      console.error('[stakingSettle] reminder email failed for position', p.id, e);
      // Stamp stays null — retried next cycle, as long as maturityAt is still
      // in the future (never sent late).
    }
  }

  // --- Pass 3: retry any renewal-outcome emails that failed to send earlier (AC-21) ---
  const notifyRetryCandidates = await prisma.stakePosition.findMany({
    where: { renewalProcessedAt: { not: null }, renewalNotifiedAt: null, renewalStatus: { notIn: ['NONE', 'FAILED_ACCOUNT_INACTIVE'] } },
    select: { id: true },
    take: 200,
  });
  for (const p of notifyRetryCandidates) {
    await sendRenewalOutcomeIfNeeded(p.id);
  }

  // MLM referral commission for this settlement day — runs after base interest is
  // credited (bonuses are a % of that interest). No-op unless REFERRAL_BONUS_ENABLED.
  const referral = await payReferralBonuses(now);

  return {
    processed, matured, renewed, renewalsFailed, renewalsDeferred, daysCredited,
    totalPaid: totalPaid.toFixed(), at: now.toISOString(), referral,
  };
}
