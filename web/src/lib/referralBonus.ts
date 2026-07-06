import 'server-only';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db';
import { stakingDayMs } from '@/lib/stakingMath';
import { getDownline } from '@/lib/referralTree';
import { computeBonus } from '@/lib/referralBonusMath';

// MLM referral commission payout (Phase B). Runs once per settlement day, right
// after the base staking interest is credited, and pays each upline their daily
// 대·소실적 매칭 + 유니레벨 부스트 (in BANA). Idempotent per (user, dayKey).
//
// GATED: does nothing unless REFERRAL_BONUS_ENABLED=true. OFF in production until
// the senior's spec is finalized and legal review is cleared.
export function referralBonusEnabled(): boolean {
  return String(process.env.REFERRAL_BONUS_ENABLED ?? '').toLowerCase() === 'true';
}

export interface ReferralBonusRunResult {
  enabled: boolean;
  dayKey: string;
  uplinesPaid: number; // newly-credited uplines this run
  totalPaid: string;   // total commission recorded for this dayKey
}

export async function payReferralBonuses(now: Date = new Date()): Promise<ReferralBonusRunResult> {
  const dayKey = Math.floor(now.getTime() / stakingDayMs()).toString();
  if (!referralBonusEnabled()) {
    return { enabled: false, dayKey, uplinesPaid: 0, totalPaid: '0' };
  }

  // Uplines = every user who has at least one direct referral.
  const uplines = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT DISTINCT "referredById" AS id FROM "User" WHERE "referredById" IS NOT NULL
  `;

  const rows: Array<{ userId: string; dayKey: string; coin: string; layer1: string; layer2: string; total: string }> = [];
  for (const u of uplines) {
    const members = await getDownline(u.id);
    const b = computeBonus(members);
    if (new Decimal(b.total).gt(0)) {
      rows.push({ userId: u.id, dayKey, coin: 'BANA', layer1: b.layer1, layer2: b.layer2, total: b.total });
    }
  }

  let uplinesPaid = 0;
  if (rows.length) {
    // skipDuplicates → re-running the same day never double-pays.
    const res = await prisma.referralBonusPayout.createMany({ data: rows, skipDuplicates: true });
    uplinesPaid = res.count;
  }

  const paid = await prisma.referralBonusPayout.findMany({ where: { dayKey }, select: { total: true } });
  const totalPaid = paid.reduce((s, r) => s.plus(new Decimal(r.total)), new Decimal(0));
  return { enabled: true, dayKey, uplinesPaid, totalPaid: totalPaid.toFixed() };
}
