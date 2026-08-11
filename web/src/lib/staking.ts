import 'server-only';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db';
import { fullInterest, aprPct } from '@/lib/stakingMath';
// Pure constant only (not `@/lib/stakingRenew`, which also pulls in `@/lib/db`
// and `@/lib/email/resend` for the legacy renewal-decision engine this file
// never calls) — same "math file, not the engine file" import this route
// family already uses elsewhere (api/admin/staking/positions/route.ts,
// api/staking/positions/[id]/auto-renew/route.ts).
import { AUTO_RENEW_MAX_TERM_DAYS } from '@/lib/stakingRenewMath';
import { settleMaturedPositionsV2, lockedPrincipalForLocal } from '@/lib/stakingV2';

// rev05 CUT-4 (T-7, §5.2①): the legacy v1 `Position`/`serializePosition` pair
// (StakePosition shape: dailyRatePct/paidInterest/accruedInterest) is REMOVED,
// not renamed — the last two callers (api/staking/positions/route.ts,
// api/staking/positions/[id]/auto-renew/route.ts) were migrated to V2 in this
// same cutover, and the v1 execution/grant routes have been fail-closed since
// CUT-0 (CS-1′) with CS-2′ confirming 0 rows in the legacy table, so no
// caller of the old shape can exist. `serializePositionV2` below (shared by
// both of those routes, plus mirrored — not imported, per that route's own
// admin/user separation — by api/admin/staking/positions/route.ts's own
// `serializePositionV2`) is the only serializer left.
type PositionV2 = {
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

/**
 * Serialize a StakePositionV2 row for the user-facing API. Shared by
 * api/staking/positions/route.ts and api/staking/positions/[id]/auto-renew/route.ts
 * (CUT-4 / T-7) so both routes' JSON shape can never drift apart.
 *
 * rev05 §5.2① field changes from the legacy v1 serializer:
 *   - `accruedInterest` DELETED (not renamed) — V2 has no live day-elapsed
 *     projection concept; only what the settlement engine has actually
 *     ledgered may ever be shown as "earned" (A-4 principles 2/6 F-C fix).
 *   - `dailyRatePct` -> `baseDailyRatePct`.
 *   - `paidInterest` -> `ledgeredYield`.
 *   - status set has no `'PAID'` member (StakePositionV2Status, schema.prisma).
 * `fullInterest`/`projectedTotal` are KEPT — a fixed term-contract quantity
 * (principal × baseDailyRatePct × termDays), not the banned live projection —
 * now computed from `baseDailyRatePct` per §5.2④'s note for StakeSheet's
 * contract display.
 */
export function serializePositionV2(p: PositionV2) {
  const full = fullInterest(p.principal, p.baseDailyRatePct, p.termDays);
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
    fullInterest: full.toFixed(),
    projectedTotal: new Decimal(p.principal).plus(full).toFixed(),
    // Real amounts credited by the V2 settlement engine (the yield ledger).
    ledgeredYield: p.ledgeredYield ?? '0',
    daysPaid: p.daysPaid ?? 0,
    // --- Auto-renewal — inert while AUTO_RENEW_V2_ENABLED=false
    // (docs/specs/staking-v2-auto-renew-cutover-ruling.md). Every V2 position
    // has autoRenew=false/renewalStatus='NONE' today (no supported path sets
    // them otherwise) — hiding the corresponding UI control is T-9's job
    // (R-AR-3), not this serializer's.
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
