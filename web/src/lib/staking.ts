import 'server-only';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db';
import { accruedInterest, fullInterest, aprPct } from '@/lib/stakingMath';

type Position = {
  id: string;
  coin: string;
  principal: string;
  dailyRatePct: string;
  termDays: number;
  startAt: Date;
  maturityAt: Date;
  status: string;
  productId: string;
  paidInterest?: string;
  daysPaid?: number;
};

/**
 * Flip a matured position to MATURED (which unlocks its principal) ONLY once every
 * day of its term has actually been paid. Lazy settlement — called on read so
 * statuses stay current without a background job.
 *
 * CRITICAL: we must NOT mature a position that still has unpaid days. The daily
 * settlement job (`runStakingSettlement`) credits ACTIVE (and matured-but-unpaid)
 * positions; if this lazy path flipped a position to MATURED before its final
 * day(s) were credited, that interest could be stranded. So here we only unlock
 * positions with `daysPaid >= termDays`, and leave the rest ACTIVE for the
 * settlement job to credit-then-mature. (Prisma can't compare two columns in a
 * single updateMany, so we select candidates past maturity and filter in code.)
 */
export async function settleMaturedPositions(userId?: string): Promise<void> {
  try {
    const candidates = await prisma.stakePosition.findMany({
      where: { status: 'ACTIVE', maturityAt: { lte: new Date() }, ...(userId ? { userId } : {}) },
      select: { id: true, daysPaid: true, termDays: true },
    });
    const ids = candidates.filter((p) => p.daysPaid >= p.termDays).map((p) => p.id);
    if (ids.length) {
      await prisma.stakePosition.updateMany({
        where: { id: { in: ids } },
        data: { status: 'MATURED', paidAt: new Date() },
      });
    }
  } catch {
    /* best-effort */
  }
}

/**
 * Sum of soft-locked (non-withdrawable) principal per coin for a user.
 * Only ACTIVE positions lock funds — once MATURED the principal is released back
 * to the available balance.
 */
export async function lockedPrincipalByCoin(userId: string): Promise<Map<string, Decimal>> {
  const rows = await prisma.stakePosition.findMany({
    where: { userId, status: 'ACTIVE' },
    select: { coin: true, principal: true },
  });
  const m = new Map<string, Decimal>();
  for (const r of rows) {
    m.set(r.coin, (m.get(r.coin) ?? new Decimal(0)).plus(new Decimal(r.principal)));
  }
  return m;
}

/** Serialize a position with computed accrual fields for the API. */
export function serializePosition(p: Position) {
  const accrued = accruedInterest(p.principal, p.dailyRatePct, p.startAt, p.termDays);
  const full = fullInterest(p.principal, p.dailyRatePct, p.termDays);
  return {
    id: p.id,
    productId: p.productId,
    coin: p.coin,
    principal: p.principal,
    dailyRatePct: p.dailyRatePct,
    aprPct: aprPct(p.dailyRatePct).toFixed(2),
    termDays: p.termDays,
    startAt: p.startAt.toISOString(),
    maturityAt: p.maturityAt.toISOString(),
    status: p.status,
    accruedInterest: accrued.toFixed(),
    fullInterest: full.toFixed(),
    projectedTotal: new Decimal(p.principal).plus(full).toFixed(),
    // Real amounts credited by the daily worker (the rewards ledger).
    paidInterest: p.paidInterest ?? '0',
    daysPaid: p.daysPaid ?? 0,
  };
}
