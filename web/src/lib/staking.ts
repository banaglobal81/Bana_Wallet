import 'server-only';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db';
import { accruedInterest, fullInterest, aprPct } from '@/lib/stakingMath';
import { AUTO_RENEW_MAX_TERM_DAYS } from '@/lib/stakingRenew';
import { settleMaturedPositionsV2, lockedPrincipalForLocal } from '@/lib/stakingV2';

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
 * Flip a matured position to MATURED (unlocking its principal). Lazy
 * settlement — called on read so statuses stay current without waiting for
 * the next batch settlement cycle.
 *
 * rev05 CUT-3 (T-6, §5.2 ②): delegates straight to `settleMaturedPositionsV2`
 * (lib/stakingV2.ts) — the V2 engine is now the only settlement path (the v1
 * `StakePosition` execution route has been fail-closed since CUT-0/CS-1′, and
 * the v1 grant route since the same cutover, so no new v1 position can be
 * created; CS-2′ confirmed the v1 table holds 0 rows before this cutover).
 * Signature and best-effort/never-throws contract are unchanged, so every
 * existing caller (api/staking/positions/route.ts, api/nia/withdrawals/route.ts)
 * keeps working without its own edit.
 */
export async function settleMaturedPositions(userId?: string): Promise<void> {
  await settleMaturedPositionsV2(userId);
}

/**
 * Sum of soft-locked (non-withdrawable) principal per coin for a user.
 *
 * rev05 CUT-3 (T-6, §5.2 ②): delegates to `lockedPrincipalForLocal`
 * (lib/stakingV2.ts) per coin, instead of summing `StakePosition.principal`
 * directly. This is not just a table swap — it fixes a real double-count the
 * old v1 approach had once A-3 holds exist: `lockedPrincipalForLocal` sums
 * ACTIVE `LocalBalanceHold(STAKE_PRINCIPAL_LOCK)` rows, which are created
 * ONLY for `fundingSource:'USER_BALANCE'` positions (A-4 principle 5 — a
 * `PLATFORM_GRANT` position never locks any of the user's own balance, so it
 * must never count as "locked" here). Summing `StakePositionV2.principal`
 * directly, the way the v1 version did, would have wrongly counted grant
 * principal as user-owned locked funds.
 */
export async function lockedPrincipalByCoin(userId: string): Promise<Map<string, Decimal>> {
  const coins = await prisma.stakePositionV2.findMany({
    where: { userId, status: 'ACTIVE' },
    select: { coin: true },
    distinct: ['coin'],
  });
  const m = new Map<string, Decimal>();
  for (const { coin } of coins) {
    m.set(coin, await lockedPrincipalForLocal(userId, coin));
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
