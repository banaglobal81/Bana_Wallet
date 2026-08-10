import 'server-only';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db';
import { accruedInterest, fullInterest, aprPct } from '@/lib/stakingMath';
import { matureOrRenewPosition, AUTO_RENEW_MAX_TERM_DAYS } from '@/lib/stakingRenew';

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
  autoRenew?: boolean;
  renewalStatus?: string;
  renewedIntoPositionId?: string | null;
  renewedFromPositionId?: string | null;
  grantedByAdminId?: string | null;
};

/**
 * Flip a matured position to MATURED (which unlocks its principal, and — per
 * docs/specs/staking-auto-renew-prd.md §6 — decides/executes any standing
 * auto-renew instruction) ONLY once every day of its term has actually been
 * paid. Lazy settlement — called on read so statuses stay current without a
 * background job.
 *
 * CRITICAL: we must NOT mature a position that still has unpaid days. The daily
 * settlement job (`runStakingSettlement`) credits ACTIVE (and matured-but-unpaid)
 * positions; if this lazy path flipped a position to MATURED before its final
 * day(s) were credited, that interest could be stranded. So here we only unlock
 * positions with `daysPaid >= termDays`, and leave the rest ACTIVE for the
 * settlement job to credit-then-mature.
 *
 * The actual flip (and any renewal) goes through `matureOrRenewPosition` —
 * the ONLY code permitted to write MATURED — so this path and the settlement
 * worker behave identically by construction (PRD §1.3/§6, AC-19). One
 * transaction per position (never a batch), so each candidate is handled
 * with its own `matureOrRenewPosition` call.
 */
export async function settleMaturedPositions(userId?: string): Promise<void> {
  try {
    const candidates = await prisma.stakePosition.findMany({
      where: { status: 'ACTIVE', maturityAt: { lte: new Date() }, ...(userId ? { userId } : {}) },
      select: { id: true, daysPaid: true, termDays: true },
    });
    const now = new Date();
    for (const p of candidates) {
      if (p.daysPaid >= p.termDays) {
        await matureOrRenewPosition(p.id, now);
      }
      // else: leave ACTIVE — the settlement job still owes it unpaid days.
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
    // --- Auto-renewal (docs/specs/staking-auto-renew-prd.md §4 S4) ---
    autoRenew: p.autoRenew ?? false,
    renewalStatus: p.renewalStatus ?? 'NONE',
    renewedIntoPositionId: p.renewedIntoPositionId ?? null,
    renewedFromPositionId: p.renewedFromPositionId ?? null,
    // Derived so the client never re-implements the cap/grant rule
    // (copy-spec §1.1). `grantedByAdminId` itself is deliberately NOT
    // serialized — the admin's identity is not the user's business.
    autoRenewEligible: p.termDays <= AUTO_RENEW_MAX_TERM_DAYS && (p.grantedByAdminId ?? null) == null,
  };
}
