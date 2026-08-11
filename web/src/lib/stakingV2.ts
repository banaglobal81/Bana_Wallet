import 'server-only';

// A-4 (V2-CORE) — v2 staking business logic: position creation, maturity, and
// settlement. Implements the interface contract A-4 §9
// (docs/specs/staking-yield-system-v2-design-a4-staking-schema.md) as scoped by
// docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md CUT-1 (T-3):
//   - CP-2 (rev05 §3.2 ⓑ) — assertExecutionAllowed(coin, 'NEW_POSITION') MUST run
//     before any new position is created. This was the one gap X-3′ T2 flagged: the
//     gate existed in coinAuthority.ts but had zero callers.
//   - CP-3 (rev05 §3.2 ⓓ) — no position may be created before the maturity/release
//     path exists and works (this file ships both together, in the same CUT-1 merge).
//   - SETTLE-1/SETTLE-2/SETTLE-3 (A-4 §5) — settlement writes are incremental (never
//     perDay × dueDays recomputation — that was the F-C defect in the legacy
//     stakingSettle.ts), a single DB transaction per position, and gated by
//     assertIssuanceAllowed(coin) (skip, not error, on T2_HALTED).
//
// STATUS (CUT-1): this module has NO callers yet. No API route imports it. It is a
// "dark merge" — see rev05 §5.1 CUT-1 row ("무해(호출자 없음)"). Wiring into
// /api/staking/* routes and the admin surface is CUT-2/CUT-3/CUT-4 (later work).
//
// CLAUDE.md rule 2: all amount arithmetic uses decimal.js — never Number()/parseFloat.

import Decimal from 'decimal.js';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { assertExecutionAllowed, assertIssuanceAllowed, CoinAuthorityBlockedError } from '@/lib/coinAuthority';
import { placeHold, releaseHold } from '@/lib/localLedger';
import { getPlatformSettings } from '@/lib/platformSettings';
import { daysElapsed, dailyInterest, stakingDayMs, DAY_MS } from '@/lib/stakingMath';
import { payReferralBonuses, type ReferralBonusRunResult } from '@/lib/referralBonus';
import { reminderLeadMs } from '@/lib/stakingRenewMath';
import { sendMaturityReminderEmail } from '@/lib/email/resend';

type TxClient = Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// Shared error helper — mirrors the existing route-error convention (see the
// legacy web/src/app/api/staking/stake/route.ts's err()/Object.assign pattern) so
// whoever wires this into a route (CUT-4) can reuse it directly.
// ---------------------------------------------------------------------------

function stakeError(
  message: string,
  code: string,
  status: number,
  params?: Record<string, string>,
): Error & { code: string; status: number; params?: Record<string, string> } {
  return Object.assign(new Error(message), { code, status, ...(params ? { params } : {}) });
}

// ---------------------------------------------------------------------------
// CP-10 (rev05 §4.6) — pure projection math, unit-testable without a database.
// ---------------------------------------------------------------------------

export interface ActivePositionLiabilityInput {
  principal: string;
  baseDailyRatePct: string;
  termDays: number;
  daysPaid: number;
}

export interface NewPositionLiabilityInput {
  principal: string;
  baseDailyRatePct: string;
  termDays: number;
}

/**
 * CP-10's per-creation projection (rev05 §4.6, as scoped for this CUT-1 stake-time
 * check — the product CLOSED->OPEN/capacity-raise check itself is CP-6's job, owned
 * by the admin route (CUT-2/T-5), NOT this function): the theoretical maximum
 * *remaining* interest owed on every currently-ACTIVE position of this coin, plus
 * the theoretical maximum interest the position being created could ever owe
 * (its full term, since a brand-new position has accrued nothing yet). This is a
 * real-time defense-in-depth layer on top of CP-6 — it catches the case where the
 * platform's cap is lowered, or several OPEN products' combined theoretical
 * liability is consumed concurrently, after a product was already opened.
 */
export function projectedInterestLiability(
  existingActive: ActivePositionLiabilityInput[],
  newPosition: NewPositionLiabilityInput,
): Decimal {
  const existingTotal = existingActive.reduce((acc, p) => {
    const remainingDays = Math.max(0, p.termDays - p.daysPaid);
    return acc.plus(dailyInterest(p.principal, p.baseDailyRatePct).times(remainingDays));
  }, new Decimal(0));
  const newMax = dailyInterest(newPosition.principal, newPosition.baseDailyRatePct).times(newPosition.termDays);
  return existingTotal.plus(newMax);
}

// ---------------------------------------------------------------------------
// createStakePositionV2 — A-4 §9 item 1
// ---------------------------------------------------------------------------

export type PositionFundingSourceValue = 'USER_BALANCE' | 'PLATFORM_GRANT';

export interface CreateStakePositionV2Input {
  userId: string;
  /** Denormalized onto StakePositionV2.email, admin-view convention (unchanged from v1). */
  email: string;
  niaUserId?: string | null;
  coin: string;
  productId: string;
  /** Canonical positive decimal string. */
  principal: string;
  /** Defaults to 'USER_BALANCE'. */
  fundingSource?: PositionFundingSourceValue;
  /**
   * Audit/display only (A-4 principle 4) — required when fundingSource is
   * 'PLATFORM_GRANT'. No live route creates a PLATFORM_GRANT position in
   * V2-CORE today (rev04 §1.8 requirement G-E: "V2-CORE에서 그랜트 기능은 제공하지
   * 않는다", and rev05 CS-1′/T-1 fail-closes the v1 grant route). This branch
   * exists so the function is complete per the A-4 §9 interface contract if/when
   * that policy changes — it is dead code from every currently-live caller's
   * perspective, not a new grant surface.
   */
  grantedByAdminId?: string | null;
  now?: Date;
}

export interface StakePositionV2Created {
  id: string;
  maturityAt: string;
}

/**
 * A-4 §9 item 1. Order of operations:
 *   1. CP-2 — assertExecutionAllowed(coin, 'NEW_POSITION'), BEFORE the transaction
 *      opens (mirrors the withdrawal route's assertExecutionAllowed placement in
 *      web/src/app/api/nia/withdrawals/route.ts — the gate is a pre-condition, not
 *      something re-verified mid-transaction).
 *   2. Single DB transaction: advisory-lock (coin, then product, then user) to
 *      serialize concurrent stakes against the same product's capacity / this
 *      coin's interest-liability cap, then validate the product (OPEN, min/max,
 *      capacity), then CP-10's projection check, then create the position row,
 *      then (USER_BALANCE only) placeHold + backfill principalHoldId — exactly
 *      the "create position -> create hold with relatedId=position.id -> backfill
 *      principalHoldId" sequence A-4 §9 item 1 describes, all inside the one
 *      transaction.
 *
 *      Lock order note (wallet-security-expert review, CUT-1): CP-10's cap check
 *      below sums projected interest liability across ALL OPEN products of this
 *      coin, but the product/user locks alone only serialize callers targeting the
 *      SAME product — two concurrent createStakePositionV2 calls for two DIFFERENT
 *      products of the same coin were NOT serialized against each other, so both
 *      could read the cap as "not yet exceeded" and commit, together pushing the
 *      coin's real liability over the cap. The `stake_coin:${coin}` lock below
 *      closes that gap by serializing every creation for a given coin, regardless
 *      of product. It is acquired FIRST (coin is the widest-scoped resource),
 *      before the existing product/user locks, so this function's lock order is
 *      coin -> product -> user. This does not conflict with the legacy v1 stake
 *      route (product -> user) or stakingRenew.ts (position -> product): neither
 *      of those ever acquires the coin lock, so there is no cycle — the coin lock
 *      is only ever held by this function, always first.
 *
 * Today's scope note (N-6): only BANA is stakeable and BANA is LOCAL-authority, so
 * the USER_BALANCE branch below always locks via A-3's placeHold. A-4 §9 item 1's
 * HUB-authority USER_BALANCE branch (verify via hub balance, no A-3 hold) is not
 * implemented here — there is no live HUB-authority stakeable coin to exercise it
 * against (§10 of the design doc acknowledges this same asymmetry).
 */
export async function createStakePositionV2(input: CreateStakePositionV2Input): Promise<StakePositionV2Created> {
  const fundingSource: PositionFundingSourceValue = input.fundingSource ?? 'USER_BALANCE';
  if (fundingSource === 'PLATFORM_GRANT' && !input.grantedByAdminId) {
    throw stakeError(
      'createStakePositionV2: grantedByAdminId is required when fundingSource=PLATFORM_GRANT.',
      'STAKE_GRANT_MISSING_ADMIN_ID',
      400,
    );
  }

  const principal = new Decimal(input.principal);
  if (!principal.isFinite() || principal.lte(0)) {
    throw stakeError('createStakePositionV2: principal must be a positive decimal string.', 'STAKE_INVALID_AMOUNT', 400);
  }

  // CP-2 / T-2 (rev05 §3.2 ⓑ) — the gap this cutover exists to close. A new
  // position is treated as new issuance-adjacent liability, so T1_WARNING (unlike
  // WITHDRAWAL/SETTLEMENT) requires an explicit admin override — see
  // coinAuthority.ts's assertExecutionAllowed doc comment.
  await assertExecutionAllowed(input.coin, 'NEW_POSITION');

  const now = input.now ?? new Date();

  return prisma.$transaction(async (tx) => {
    // Widest-scoped lock first (see the lock-order note in this function's doc
    // comment above) — serializes CP-10's cross-product cap check for this coin
    // against every other concurrent createStakePositionV2 call for the same coin,
    // no matter which product they each target.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`stake_coin:${input.coin}`}, 0))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`stake_product:${input.productId}`}, 0))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`stake_user:${input.userId}`}, 0))`;

    const product = await tx.stakingProductV2.findUnique({ where: { id: input.productId } });
    if (!product) {
      throw stakeError('createStakePositionV2: product not found.', 'STAKE_PRODUCT_NOT_FOUND', 404);
    }
    if (product.coin !== input.coin) {
      throw stakeError(
        `createStakePositionV2: product coin mismatch (product is ${product.coin}, requested ${input.coin}).`,
        'STAKE_PRODUCT_COIN_MISMATCH',
        400,
      );
    }
    if (product.status !== 'OPEN') {
      throw stakeError('createStakePositionV2: product is closed.', 'STAKE_PRODUCT_CLOSED', 409);
    }
    if (product.minAmount && principal.lt(new Decimal(product.minAmount))) {
      throw stakeError(
        `createStakePositionV2: below minimum stake (${product.minAmount} ${product.coin}).`,
        'STAKE_BELOW_MIN',
        400,
        { min: product.minAmount, coin: product.coin },
      );
    }
    if (product.maxAmount && principal.gt(new Decimal(product.maxAmount))) {
      throw stakeError(
        `createStakePositionV2: above maximum stake (${product.maxAmount} ${product.coin}).`,
        'STAKE_ABOVE_MAX',
        400,
        { max: product.maxAmount, coin: product.coin },
      );
    }

    if (product.capacity) {
      const active = await tx.stakePositionV2.findMany({
        where: { productId: product.id, status: 'ACTIVE' },
        select: { principal: true },
      });
      const used = active.reduce((s, p) => s.plus(new Decimal(p.principal)), new Decimal(0));
      if (used.plus(principal).gt(new Decimal(product.capacity))) {
        const left = Decimal.max(0, new Decimal(product.capacity).minus(used));
        throw stakeError(
          `createStakePositionV2: not enough capacity left in this product (only ${left.toFixed()} ${product.coin} available).`,
          'STAKE_PRODUCT_FULL',
          409,
          { left: left.toFixed(), coin: product.coin },
        );
      }
    }

    // CP-10 (rev05 §4.6) — fail-closed: no cap configured means no new position of
    // ANY product may open, full stop (the reversed-null convention documented on
    // PlatformSetting.maxInterestLiabilityCapBana in schema.prisma).
    const settings = await getPlatformSettings();
    if (settings.maxInterestLiabilityCapBana == null) {
      throw stakeError(
        'createStakePositionV2: interest liability cap is not configured (fail-closed) — no new positions may open.',
        'STAKE_INTEREST_LIABILITY_CAP_NOT_SET',
        409,
      );
    }
    const cap = new Decimal(settings.maxInterestLiabilityCapBana);

    const existingActive = await tx.stakePositionV2.findMany({
      where: { coin: input.coin, status: 'ACTIVE' },
      select: { principal: true, baseDailyRatePct: true, termDays: true, daysPaid: true },
    });
    const projected = projectedInterestLiability(existingActive, {
      principal: principal.toFixed(),
      baseDailyRatePct: product.baseDailyRatePct,
      termDays: product.termDays,
    });
    if (projected.gt(cap)) {
      throw stakeError(
        `createStakePositionV2: projected interest liability ${projected.toFixed()} ${input.coin} would exceed the platform cap ${cap.toFixed()}.`,
        'STAKE_INTEREST_LIABILITY_CAP_EXCEEDED',
        409,
        { projected: projected.toFixed(), cap: cap.toFixed(), coin: input.coin },
      );
    }

    // SETTLE-3 (A-4 §5.4) — grant principal is new issuance-adjacent liability even
    // though no LocalBalanceHold is ever created for it (A-4 principle 5). Checked
    // BEFORE the position row is written, so a blocked grant never gets created.
    if (fundingSource === 'PLATFORM_GRANT') {
      await assertIssuanceAllowed(input.coin);
    }

    const startAt = now;
    const maturityAt = new Date(startAt.getTime() + product.termDays * stakingDayMs());

    // --- Band snapshot (Q-1/A1′, A-4 principle 4) — fixed once here, never re-read. ---
    const position = await tx.stakePositionV2.create({
      data: {
        userId: input.userId,
        email: input.email,
        niaUserId: input.niaUserId ?? null,
        productId: product.id,
        coin: input.coin,
        principal: principal.toFixed(),
        baseDailyRatePct: product.baseDailyRatePct,
        maxBonusPctOfBase: product.maxBonusPctOfBase,
        termDays: product.termDays,
        startAt,
        maturityAt,
        status: 'ACTIVE',
        fundingSource,
        grantedByAdminId: fundingSource === 'PLATFORM_GRANT' ? (input.grantedByAdminId ?? null) : null,
      },
      select: { id: true },
    });

    if (fundingSource === 'USER_BALANCE') {
      // "Create position -> create hold with relatedId=position.id -> backfill
      // principalHoldId" (A-4 §9 item 1) — the hold cannot be created before the
      // position exists (it needs the position's id as relatedId), so this
      // three-step sequence, all inside this one transaction, is the resolution.
      const hold = await placeHold({
        userId: input.userId,
        coin: input.coin,
        amount: principal.toFixed(),
        reasonCode: 'STAKE_PRINCIPAL_LOCK',
        relatedType: 'STAKE_POSITION',
        relatedId: position.id,
        tx,
      });
      await tx.stakePositionV2.update({ where: { id: position.id }, data: { principalHoldId: hold.id } });
    }
    // PLATFORM_GRANT — no hold is ever created (A-4 principle 5: "excluded by
    // absence, not a runtime filter"). principalHoldId stays structurally null.

    return { id: position.id, maturityAt: maturityAt.toISOString() };
  });
}

// ---------------------------------------------------------------------------
// maturePositionV2 — A-4 §9 item 2
// ---------------------------------------------------------------------------

interface MaturableRow {
  id: string;
  status: string;
  daysPaid: number;
  termDays: number;
  fundingSource: string;
  principalHoldId: string | null;
}

/**
 * Shared by maturePositionV2 (its own transaction) and settleOnePositionV2 (reuses
 * the settlement transaction) — never opens its own transaction, so it composes
 * either way without a nested-transaction error.
 */
async function matureInTx(tx: TxClient, position: MaturableRow, now: Date): Promise<void> {
  await tx.stakePositionV2.update({ where: { id: position.id }, data: { status: 'MATURED', fullySettledAt: now } });
  if (position.fundingSource === 'USER_BALANCE') {
    if (!position.principalHoldId) {
      // Invariant violation, not a soft failure — every USER_BALANCE position must
      // carry a principalHoldId once created (createStakePositionV2 backfills it in
      // the same transaction that creates the position).
      throw new Error(
        `maturePositionV2: position ${position.id} is USER_BALANCE-funded but has no principalHoldId — invariant violation.`,
      );
    }
    // releaseHold, NOT executeHold — the soft lock; principal was never debited,
    // it returns to `available` (A-4 §9 item 2 / A-3 §4.3).
    await releaseHold(position.principalHoldId, 'position matured', { tx });
  }
  // PLATFORM_GRANT — no hold was ever created, so nothing to release.
}

/**
 * A-4 §9 item 2. Only flips ACTIVE -> MATURED once every day of the term has
 * actually been ledgered (daysPaid >= termDays) — mirrors the legacy
 * matureOrRenewPosition's guard (stakingRenew.ts) against maturing a position with
 * unpaid days. Idempotent: MATURED is a no-op, not an error.
 *
 * Deliberately does NOT implement auto-renewal, and this is now a settled,
 * `pm`-adjudicated deferral, not just an unscoped gap: CP-3's original text
 * (rev05 §3.2 ⓓ) named "`maturePositionV2` (+ auto-renew branch)" as a
 * precondition for opening the stake route, but
 * `docs/specs/staking-v2-auto-renew-cutover-ruling.md` (R-AR-7-a) struck the
 * "(+ auto-renew branch)" parenthetical from CP-3 — CP-3's actual concern
 * (§3.2 ⓓ: a hold that never releases at maturity) holds with or without
 * renewal, since a matured-without-renewal position returns principal *more*
 * certainly, not less. The V2 renewal DECISION engine (this function's
 * legacy counterpart, `matureOrRenewPosition` in stakingRenew.ts) is
 * deferred to a new track, T-20 — see that ruling §7.1 for why (three
 * undecided policy questions, one of them breaking CP-10's interest-cap
 * arithmetic) — not merely "out of this file's CUT-1 scope."
 */
export async function maturePositionV2(positionId: string, now: Date = new Date()): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "StakePositionV2" WHERE id = ${positionId} FOR UPDATE`;
    const position = await tx.stakePositionV2.findUnique({
      where: { id: positionId },
      select: { id: true, status: true, daysPaid: true, termDays: true, fundingSource: true, principalHoldId: true },
    });
    if (!position) {
      throw new Error(`maturePositionV2: position ${positionId} not found.`);
    }
    if (position.status !== 'ACTIVE') {
      return; // already MATURED — idempotent no-op, not an error.
    }
    if (position.daysPaid < position.termDays) {
      throw new Error(
        `maturePositionV2: position ${positionId} has unpaid days (daysPaid=${position.daysPaid} < termDays=${position.termDays}) — settle it first.`,
      );
    }
    await matureInTx(tx, position, now);
  });
}

// ---------------------------------------------------------------------------
// settleMaturedPositionsV2 — lazy, read-time maturity check (mirrors v1's
// settleMaturedPositions in staking.ts)
// ---------------------------------------------------------------------------

/**
 * Lazy settlement: flips any ACTIVE position past its maturityAt (whose days are
 * ALREADY fully paid — never matures a position with unpaid days, same guard as
 * maturePositionV2 itself) to MATURED on read, so statuses stay current without
 * waiting for the next batch settlement cycle. Best-effort (never throws) — same
 * contract as the legacy settleMaturedPositions.
 */
export async function settleMaturedPositionsV2(userId?: string): Promise<void> {
  try {
    const candidates = await prisma.stakePositionV2.findMany({
      where: { status: 'ACTIVE', maturityAt: { lte: new Date() }, ...(userId ? { userId } : {}) },
      select: { id: true, daysPaid: true, termDays: true },
    });
    const now = new Date();
    for (const p of candidates) {
      if (p.daysPaid >= p.termDays) {
        await maturePositionV2(p.id, now);
      }
      // else: still owes unpaid days — leave ACTIVE for runStakingSettlementV2.
    }
  } catch {
    /* best-effort */
  }
}

// ---------------------------------------------------------------------------
// runStakingSettlementV2 — A-4 §9 item 3 / SETTLE-1 / SETTLE-2
// ---------------------------------------------------------------------------

interface SettleOnePositionOutcome {
  daysCredited: number;
  ledgeredDelta: Decimal;
  matured: boolean;
  skippedHalted: boolean;
}

interface SettlementRow {
  id: string;
  userId: string;
  coin: string;
  principal: string;
  baseDailyRatePct: string;
  termDays: number;
  startAt: Date;
  daysPaid: number;
  ledgeredYield: string;
  status: string;
  fundingSource: string;
  principalHoldId: string | null;
}

/**
 * SETTLE-1 (A-4 §5.2): one position, one DB transaction, `FOR UPDATE` lock,
 * insert-then-increment (never recompute perDay × dueDays from scratch — that was
 * the legacy F-C defect). SETTLE-2 (A-4 §5.3): assertIssuanceAllowed(coin) is
 * checked inside the transaction, after acquiring the lock; on T2_HALTED this
 * position is SKIPPED (not an error) — the next cycle retries and catches up any
 * days that accrue while halted, once the halt clears.
 */
async function settleOnePositionV2(positionId: string, now: Date): Promise<SettleOnePositionOutcome> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "StakePositionV2" WHERE id = ${positionId} FOR UPDATE`;
    const position = (await tx.stakePositionV2.findUnique({
      where: { id: positionId },
      select: {
        id: true, userId: true, coin: true, principal: true, baseDailyRatePct: true, termDays: true,
        startAt: true, daysPaid: true, ledgeredYield: true, status: true, fundingSource: true, principalHoldId: true,
      },
    })) as SettlementRow | null;

    const none: SettleOnePositionOutcome = { daysCredited: 0, ledgeredDelta: new Decimal(0), matured: false, skippedHalted: false };
    if (!position || position.status !== 'ACTIVE') return none;

    const dueDays = daysElapsed(position.startAt, now, position.termDays);
    const newDays = dueDays - position.daysPaid;
    if (newDays <= 0) return none;

    // SETTLE-2 — skip (never throw) so today's settlement cycle simply resumes on
    // its own once the coin is unblocked; PoR-1″'s left side must never grow while
    // T2_HALTED (rev04 PoR-1′ definition — "이자 정산 ... 이 검사를 통과해야 한다").
    try {
      await assertIssuanceAllowed(position.coin);
    } catch (e) {
      if (e instanceof CoinAuthorityBlockedError) return { ...none, skippedHalted: true };
      throw e;
    }

    const perDay = dailyInterest(position.principal, position.baseDailyRatePct);
    const rows: Array<{
      positionId: string; userId: string; coin: string; dayIndex: number;
      baseAmount: string; bonusAmount: string; amount: string;
      mpSnapshot: string | null; bonusPctSnapshot: string; settledAt: Date;
    }> = [];
    for (let d = position.daysPaid + 1; d <= dueDays; d += 1) {
      // bonusAmount/mpSnapshot/bonusPctSnapshot are always "0"/null/"0" during
      // V2-CORE — product.maxBonusPctOfBase is always "0" (V2-BAND is out of scope,
      // rev05 §33 "V2-BAND는 범위 밖이다"). amount = baseAmount + bonusAmount (R-1).
      rows.push({
        positionId: position.id, userId: position.userId, coin: position.coin, dayIndex: d,
        baseAmount: perDay.toFixed(), bonusAmount: '0', amount: perDay.toFixed(),
        mpSnapshot: null, bonusPctSnapshot: '0', settledAt: now,
      });
    }

    // `@@unique([positionId, dayIndex])` is the defense-in-depth backstop the design
    // doc keeps even though the FOR UPDATE lock already serializes this (A-4 §5.2).
    await tx.stakeYieldLedgerEntry.createMany({ data: rows, skipDuplicates: true });

    // "방금 실제로 쓴 값의 합. perDay × newDays가 아니다" (A-4 §5.2) — sum the rows
    // actually inserted, never derive it from a rate × day-count shortcut. Today
    // (V2-CORE, no band) these two coincide, but the code must not depend on that.
    const newRowsSum = rows.reduce((acc, r) => acc.plus(new Decimal(r.amount)), new Decimal(0));

    const willMature = dueDays >= position.termDays;
    await tx.stakePositionV2.update({
      where: { id: position.id },
      data: {
        daysPaid: dueDays,
        ledgeredYield: new Decimal(position.ledgeredYield).plus(newRowsSum).toFixed(),
        lastSettledAt: now,
      },
    });

    // UserCoinYieldSummary cache — same "lock (or create), read, increment" pattern
    // localLedger.ts uses for UserCoinBalance (A-4 principle 6: cache/evidence split).
    const summaryRows = await tx.$queryRaw<{ id: string; ledgeredYieldTotal: string }[]>`
      SELECT id, "ledgeredYieldTotal" FROM "UserCoinYieldSummary"
      WHERE "userId" = ${position.userId} AND coin = ${position.coin} FOR UPDATE
    `;
    let summary = summaryRows[0];
    if (!summary) {
      const created = await tx.userCoinYieldSummary.create({
        data: { userId: position.userId, coin: position.coin, ledgeredYieldTotal: '0', claimedYieldTotal: '0' },
      });
      summary = { id: created.id, ledgeredYieldTotal: created.ledgeredYieldTotal };
    }
    await tx.userCoinYieldSummary.update({
      where: { id: summary.id },
      data: {
        ledgeredYieldTotal: new Decimal(summary.ledgeredYieldTotal).plus(newRowsSum).toFixed(),
        version: { increment: 1 },
      },
    });

    // Maturity decision, same transaction (step 2 — status is untouched above,
    // mirroring the legacy pattern's "do NOT touch status in step 1").
    if (willMature) {
      await matureInTx(tx, { ...position }, now);
    }

    return { daysCredited: newDays, ledgeredDelta: newRowsSum, matured: willMature, skippedHalted: false };
  });
}

export interface StakingSettlementV2Result {
  processed: number;
  daysCredited: number;
  totalLedgered: string;
  matured: number;
  skippedHalted: number;
  at: string;
  referral: ReferralBonusRunResult; // MLM commission run (no-op unless enabled) — CP-9
}

// R-AR-1 (docs/specs/staking-v2-auto-renew-cutover-ruling.md §4, P1 — the
// single most urgent requirement in that ruling). `sendMaturityRemindersV2`
// below sends a reminder email whose FIXED copy (messages/*.json,
// emails.autoRenewReminder) actively promises a renewal — subject "...and is
// set to renew", body "the same amount ... will be staked again". No V2
// renewal DECISION engine exists (deferred to T-20 per that ruling), so
// today this is only harmless because zero StakePositionV2 rows happen to
// have autoRenew=true — a DATA fact, not a CODE guarantee. Nothing blocks a
// manual DB fix / admin script / partial migration / backup restore from
// creating such a row, at which point this code would mail out a promise
// BANA cannot keep (the ruling calls this a "potential false notice", worse
// than a silent gap).
//
// This is a NAMED CODE CONSTANT, not a `PlatformSetting` field, an env var,
// or anything operator-editable — same rationale the legacy assumption
// ruling (staking-auto-renew-assumption-ruling.md §5, R-3) already applied
// to `AUTO_RENEW_MAX_TERM_DAYS`: a policy value this consequential must not
// be a lever anyone can flip without a code change and review. Flipping it
// to `true` is only possible once the T-20 renewal engine actually exists,
// which is the entire point — it makes "turn the promise on" and "build the
// thing that keeps the promise" the same act.
const AUTO_RENEW_V2_ENABLED = false;

/**
 * Pass 2 (rev05 CUT-3, T-6 "이메일 이설") — pre-maturity reminder emails, ported
 * from stakingSettle.ts's legacy Pass 2 onto StakePositionV2. Every field this
 * pass reads/writes (autoRenew, maturityReminderSentAt, maturityAt) was
 * deliberately carried forward unchanged onto StakePositionV2 (schema.prisma
 * comment: "unchanged structure, carried forward from StakePosition"), so
 * this is a straight table swap, not a redesign. Best-effort per email, same
 * as the legacy pass — one failed send never blocks another candidate's send
 * or the settlement result being returned.
 *
 * R-AR-1 items 2-3: while `AUTO_RENEW_V2_ENABLED` is false (today, always),
 * this function returns immediately WITHOUT running the reminder-candidate
 * query at all — the promised copy must never even become reachable while
 * it isn't true, not merely "reachable but always empty". It separately runs
 * a narrow existence check (`autoRenew: true`, no other filter) purely to
 * detect the invariant violation this whole requirement exists to catch: no
 * supported code path can ever set `autoRenew=true` today (the v1 grant/stake
 * routes are fail-closed, CUT-4's V2 stake route hasn't shipped, and no V2
 * write path ever sets it to true), so if this ever finds a row, something
 * unsupported did it, and that must be LOUD (console.error), never a silent
 * skip — the same defensive role the legacy assumption ruling gave
 * `FAILED_GRANTED_POSITION`: a guard for a broken invariant runs before any
 * rule that assumes the invariant holds.
 *
 * Deliberately NOT ported here (independent of the flag above): the legacy
 * Pass 3 (retry sweep for RENEWED/RENEWAL_FAILED outcome emails,
 * stakingSettle.ts's `notifyRetryCandidates` block). That pass exists to
 * retry a `sendRenewalOutcomeIfNeeded` claim that a *decision* pass
 * (`matureOrRenewPosition`, stakingRenew.ts) left unclaimed. No V2 counterpart
 * of `matureOrRenewPosition` exists yet — `maturePositionV2` above
 * deliberately performs only a plain maturity (see its own doc comment).
 * Concretely: `renewalStatus`/`renewalProcessedAt` are never written on any
 * StakePositionV2 row today, so a Pass-3-shaped retry sweep here would only
 * ever scan zero rows — not a skip of real work, dead code. This gap (and
 * the fixed reminder-copy problem this function now guards against) is what
 * prompted `docs/specs/staking-v2-auto-renew-cutover-ruling.md`, which
 * formally defers the whole V2 renewal decision engine + Pass 3 to a new
 * track, T-20 (`stakingRenew.ts`/`stakingRenewMath.ts` are explicitly kept
 * in the repo, unexecuted, as that track's only executable spec — not
 * deleted, per that ruling §7.1's "삭제 금지").
 */
async function sendMaturityRemindersV2(now: Date): Promise<void> {
  if (!AUTO_RENEW_V2_ENABLED) {
    const rogueCount = await prisma.stakePositionV2.count({ where: { autoRenew: true } });
    if (rogueCount > 0) {
      console.error(
        `[stakingV2] INVARIANT VIOLATION (R-AR-1): ${rogueCount} StakePositionV2 row(s) have autoRenew=true ` +
        'while AUTO_RENEW_V2_ENABLED=false. No supported code path can set this today — investigate immediately ' +
        '(manual DB edit / admin script / partial migration / backup restore are the only ways this happens). ' +
        'The reminder-renewal email is NOT being sent for these rows on purpose: its fixed copy ' +
        '(emails.autoRenewReminder) promises a renewal the V2 engine cannot perform ' +
        '(docs/specs/staking-v2-auto-renew-cutover-ruling.md §4).',
      );
    }
    return; // No candidate query. No email. The promise-making copy stays unreachable.
  }

  const candidates = await prisma.stakePositionV2.findMany({
    where: { status: 'ACTIVE', autoRenew: true, maturityReminderSentAt: null, maturityAt: { gt: now } },
    select: {
      id: true, userId: true, coin: true, principal: true, termDays: true, maturityAt: true,
      product: { select: { name: true } },
    },
  });
  for (const p of candidates) {
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
      await prisma.stakePositionV2.update({ where: { id: p.id }, data: { maturityReminderSentAt: now } });
    } catch (e) {
      console.error('[stakingV2] reminder email failed for position', p.id, e);
      // Stamp stays null — retried next cycle, same as the legacy pass, as
      // long as maturityAt is still in the future (never sent late).
    }
  }
}

/**
 * A-4 §9 item 3 (SETTLE-1/SETTLE-2 batch entry point). Shared by the cron
 * endpoint (CUT-3, api/cron/staking/route.ts) and the admin "run now" action
 * (a parallel CUT-3 change, web-admin-expert's api/admin/staking/run/route.ts —
 * not touched by this file). Loops every ACTIVE position and settles each in
 * its own transaction via settleOnePositionV2 (never a single all-positions
 * transaction — a lock held across every row for the whole run would
 * serialize the entire settlement cycle against every concurrent
 * placeHold/withdrawal on any of those positions' coins).
 *
 * CP-9 (rev05 §6.2, required): the MLM referral commission run
 * (`payReferralBonuses`) is relocated here, to the exact position the legacy
 * `runStakingSettlement()` called it from (stakingSettle.ts:199 — its very
 * last line, after every other pass) — i.e. after base interest has been
 * ledgered for this cycle. Idempotency is `@@unique([userId, dayKey])` +
 * `skipDuplicates` (already in place, unchanged by this move), so this call
 * and the legacy call are individually safe to leave both wired — but per
 * rev05 §6.2, this cutover does NOT run them concurrently: CUT-3 flips
 * `stakingWorkerEnabled=false` in the same deploy that turns this on via
 * `stakingV2WorkerEnabled=true`.
 */
export async function runStakingSettlementV2(now: Date = new Date()): Promise<StakingSettlementV2Result> {
  let processed = 0;
  let daysCredited = 0;
  let matured = 0;
  let skippedHalted = 0;
  let totalLedgered = new Decimal(0);

  const candidates = await prisma.stakePositionV2.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });

  for (const c of candidates) {
    const outcome = await settleOnePositionV2(c.id, now);
    if (outcome.skippedHalted) {
      skippedHalted += 1;
      continue;
    }
    if (outcome.daysCredited === 0 && !outcome.matured) continue; // nothing due today
    processed += 1;
    daysCredited += outcome.daysCredited;
    totalLedgered = totalLedgered.plus(outcome.ledgeredDelta);
    if (outcome.matured) matured += 1;
  }

  // Pass 2 (rev05 CUT-3 email migration) — best-effort, never throws, run
  // after every position's base interest for this cycle has been ledgered.
  await sendMaturityRemindersV2(now).catch((e) => {
    console.error('[stakingV2] sendMaturityRemindersV2 failed for this settlement cycle', e);
  });

  // CP-9 — same position as the legacy engine's last line (see doc comment above).
  const referral = await payReferralBonuses(now);

  return {
    processed, daysCredited, totalLedgered: totalLedgered.toFixed(), matured, skippedHalted,
    at: now.toISOString(), referral,
  };
}

// ---------------------------------------------------------------------------
// lockedPrincipalForLocal — A-7 LB-C1 ("LOCAL 코인은 포지션 합산이 아니라
// LocalBalanceHold(STAKE_PRINCIPAL_LOCK) 합산으로 계산")
// ---------------------------------------------------------------------------

/**
 * Sum of ACTIVE STAKE_PRINCIPAL_LOCK holds for one user+coin — the correct
 * "locked principal" figure for a LOCAL-authority coin (unlike the legacy v1
 * lockedPrincipalByCoin, which sums StakePosition rows directly; that approach
 * double-counts once A-3 holds are the source of truth for `available`, per
 * rev05 §5.2's api/staking/positions/route.ts note).
 */
export async function lockedPrincipalForLocal(userId: string, coin: string): Promise<Decimal> {
  const holds = await prisma.localBalanceHold.findMany({
    where: { userId, coin, reasonCode: 'STAKE_PRINCIPAL_LOCK', status: 'ACTIVE' },
    select: { amount: true },
  });
  return holds.reduce((acc, h) => acc.plus(new Decimal(h.amount)), new Decimal(0));
}
