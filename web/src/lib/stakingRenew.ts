import 'server-only';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db';
import { DAY_MS } from '@/lib/stakingMath';
import { sendRenewalOutcomeEmail } from '@/lib/email/resend';
import {
  AUTO_RENEW_MAX_TERM_DAYS,
  decideRenewalEligibility,
  type RenewalFailureStatus,
  type AnyFailureStatus,
} from '@/lib/stakingRenewMath';

// Pure decision logic (constant, type, and the ordered eligibility check)
// lives in stakingRenewMath.ts — see that file's header for why (mirrors the
// referralBonus.ts/referralBonusMath.ts and
// deepCoreProgress.ts/deepCoreProgressMath.ts split already used in this
// codebase, and works around web/vitest.config.ts's `server-only` stub alias
// pointing at a file that doesn't exist in the repo). Re-exported here so
// every existing `@/lib/stakingRenew` import keeps working unchanged.
export { AUTO_RENEW_MAX_TERM_DAYS };
export type { RenewalFailureStatus };

// ---------------------------------------------------------------------------
// Auto-renewal — the maturity-time decision engine.
//
// Companion spec: docs/specs/staking-auto-renew-copy-spec.md (BUILD-READY,
// product-planner, 2026-08-09). That doc's own header names two parent docs —
// docs/specs/staking-auto-renew-prd.md ("Revision 2") and
// docs/specs/staking-auto-renew-ruling.md (`pm`, 2026-08-09) — as the source
// of the exact business rules (the "E2a".."E9" check labels referenced below,
// the R-1..R-13 rule numbers, the M-1/M-2/M-3 ship conditions). NEITHER FILE
// EXISTS IN THIS REPO. Every business rule this module needed that those two
// missing documents would have settled was reconstructed from secondary
// evidence (the copy-spec, the three applied Prisma migrations, the schema
// comments, and live call-site code) and marked ASSUMPTION pending review.
//
// That review has since happened:
// `docs/specs/staking-auto-renew-assumption-ruling.md` (`pm`, AUTHORITATIVE
// RULING, 2026-08-10) adjudicates every ASSUMPTION marker that was in this
// file and in stakingRenewMath.ts. It is now the authority for all of them —
// the comments below cite its section numbers rather than re-deriving the
// reasoning. If `staking-auto-renew-prd.md` / `staking-auto-renew-ruling.md`
// ever reappear, see the ruling's §7 for how to reconcile.
// ---------------------------------------------------------------------------

/**
 * Transient-failure ceiling (schema.prisma comment on
 * `StakePosition.renewalAttempts`): "At >= 3, force plain maturity with
 * FAILED_SYSTEM so the principal is never stranded behind a retry loop."
 * The `3` itself is quoted verbatim from that comment; the retry mechanics
 * (increment-and-defer on calls 1-3, force FAILED_SYSTEM on call 4) are
 * ruling §4 (APPROVED as implemented) — the requirement being bought is a
 * ceiling on delay, not a count: a position must never stay ACTIVE past
 * maturity for more than three settlement cycles because of renewal
 * retries; the fourth cycle must resolve it either way.
 */
const MAX_RENEWAL_ATTEMPTS = 3;

export type MatureOrRenewOutcome =
  // Position was already MATURED/PAID by the time we looked (a concurrent
  // caller — the lazy read-path vs. the settlement worker — got there first
  // this cycle) or didn't exist. No write happened; nothing to count twice.
  | { outcome: 'ALREADY_HANDLED' }
  // autoRenew was off at maturity — plain maturity, renewalStatus = NONE, no
  // email (this is not a new email surface; it's the pre-existing plain
  // maturity behavior).
  | { outcome: 'MATURED_NO_RENEWAL' }
  // autoRenew was on and every eligibility check passed — principal restaked
  // into a successor position.
  | { outcome: 'RENEWED'; newPositionId: string }
  // autoRenew was on but at least one eligibility check failed — plain
  // maturity, renewalStatus records the specific reason.
  | { outcome: 'RENEWAL_FAILED'; renewalStatus: AnyFailureStatus }
  // An unexpected error was hit while deciding/writing the renewal (not one
  // of the modeled eligibility checks). renewalAttempts was incremented;
  // retried next settlement cycle unless/until it hits MAX_RENEWAL_ATTEMPTS,
  // at which point a later call forces FAILED_SYSTEM instead of retrying
  // forever. Ruling §4 (A5, APPROVED with no change): this is an internal
  // return-type variant only, never promoted into the `StakeRenewalStatus`
  // enum — a deferred position's `renewalStatus` stays at its default NONE
  // while it remains ACTIVE, since renewalStatus is written exactly once,
  // inside the maturity transaction, which a deferred position never
  // commits. Every caller only pattern-matches the outcomes it cares about
  // (if/else-if, no exhaustive switch), so adding this variant is safe.
  // A4-C1 (ruling §4, P1): callers that count outcomes (stakingSettle.ts)
  // MUST count this one too — it is the only outcome that leaves a matured
  // user's principal locked with no interest accruing, and the only one
  // otherwise invisible to operators.
  | { outcome: 'RENEWAL_DEFERRED' };

type PositionForDecision = {
  id: string;
  userId: string;
  niaUserId: string;
  productId: string;
  coin: string;
  principal: string;
  dailyRatePct: string;
  termDays: number;
  maturityAt: Date;
  status: string;
  autoRenew: boolean;
  grantedByAdminId: string | null;
  renewalAttempts: number;
};

/**
 * The ONLY function permitted to flip a `StakePosition` to `MATURED` (PRD
 * §1.3/§6, AC-19 — see call-site comments in stakingSettle.ts / staking.ts).
 * Both the daily settlement job and the lazy on-read path call this once a
 * position's every day is paid (`daysPaid >= termDays`), so both behave
 * identically by construction.
 *
 * Serialized per-position via a Postgres advisory lock (same pattern as the
 * stake-creation transaction in api/staking/stake/route.ts) rather than an
 * optimistic conditional update — holding the lock for the whole decision +
 * write means a concurrent caller for the SAME position simply blocks until
 * we commit, then sees the new `status` and returns ALREADY_HANDLED itself.
 *
 * Email send is intentionally OUTSIDE this function's transaction — fired
 * after commit, best-effort (copy-spec §4: "After commit, best-effort, never
 * inside the maturity transaction, never able to roll it back").
 */
export async function matureOrRenewPosition(positionId: string, now: Date = new Date()): Promise<MatureOrRenewOutcome> {
  let txResult:
    | { kind: 'ALREADY_HANDLED' }
    | { kind: 'MATURED_NO_RENEWAL' }
    | { kind: 'RENEWED'; newPositionId: string }
    | { kind: 'RENEWAL_FAILED'; renewalStatus: AnyFailureStatus };

  try {
    txResult = await prisma.$transaction(async (tx) => {
      // Advisory lock keyed by position id — serializes every caller racing
      // to mature/renew this exact position.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`stake_position:${positionId}`}, 0))`;

      const position = (await tx.stakePosition.findUnique({ where: { id: positionId } })) as PositionForDecision | null;
      if (!position || position.status !== 'ACTIVE') {
        return { kind: 'ALREADY_HANDLED' as const };
      }

      if (!position.autoRenew) {
        await tx.stakePosition.update({
          where: { id: position.id },
          data: { status: 'MATURED', renewalStatus: 'NONE', renewalProcessedAt: now, paidAt: now },
        });
        return { kind: 'MATURED_NO_RENEWAL' as const };
      }

      // Attempt ceiling reached on a prior transient failure — stop retrying
      // and release the principal via a plain (failed) maturity instead of
      // leaving it stranded behind a retry loop forever.
      if (position.renewalAttempts >= MAX_RENEWAL_ATTEMPTS) {
        await tx.stakePosition.update({
          where: { id: position.id },
          data: { status: 'MATURED', renewalStatus: 'FAILED_SYSTEM', renewalProcessedAt: now, paidAt: now },
        });
        return { kind: 'RENEWAL_FAILED' as const, renewalStatus: 'FAILED_SYSTEM' as const };
      }

      // Product lock, same consistent order (product after position) used
      // elsewhere in this module — avoids deadlocking against the stake
      // route, which locks product then user for a *different* pair of
      // resources, so there's no overlapping lock order to worry about.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`stake_product:${position.productId}`}, 0))`;

      const [product, user, activeOthers] = await Promise.all([
        tx.stakingProduct.findUnique({ where: { id: position.productId } }),
        tx.user.findUnique({ where: { id: position.userId }, select: { email: true, locale: true, disabled: true } }),
        tx.stakePosition.findMany({
          where: { productId: position.productId, status: 'ACTIVE', id: { not: position.id } },
          select: { principal: true },
        }),
      ]);

      if (!product) {
        // Defensive — a product can't be deleted while positions reference
        // it (FK), but treat a missing product the same as FAILED_SYSTEM
        // rather than throwing.
        await tx.stakePosition.update({
          where: { id: position.id },
          data: { status: 'MATURED', renewalStatus: 'FAILED_SYSTEM', renewalProcessedAt: now, paidAt: now },
        });
        return { kind: 'RENEWAL_FAILED' as const, renewalStatus: 'FAILED_SYSTEM' as const };
      }

      const activePrincipalExcludingSelf = activeOthers
        .reduce((s, p) => s.plus(new Decimal(p.principal)), new Decimal(0))
        .toFixed();

      const failReason = decideRenewalEligibility({
        // A3-C1 (ruling §3, P2): `StakePosition.userId` is a plain scalar
        // with no FK to `User`, so an orphaned position is structurally
        // possible. Fail CLOSED on a missing row — `?? true`, not `?? false`
        // — so a position whose owner cannot be found is treated the same
        // as a disabled owner: matured, not renewed, silent (there is no
        // address to notify, same reason the disabled case is silent).
        userDisabled: user?.disabled ?? true,
        grantedByAdminId: position.grantedByAdminId,
        positionTermDays: position.termDays,
        positionPrincipal: position.principal,
        positionDailyRatePct: position.dailyRatePct,
        positionCoin: position.coin,
        productStatus: product.status,
        productTermDays: product.termDays,
        productDailyRatePct: product.dailyRatePct,
        productCoin: product.coin,
        productMinAmount: product.minAmount,
        productMaxAmount: product.maxAmount,
        productCapacity: product.capacity,
        productActivePrincipalExcludingSelf: activePrincipalExcludingSelf,
      });

      if (failReason) {
        await tx.stakePosition.update({
          where: { id: position.id },
          data: { status: 'MATURED', renewalStatus: failReason, renewalProcessedAt: now, paidAt: now },
        });
        return { kind: 'RENEWAL_FAILED' as const, renewalStatus: failReason };
      }

      // Eligible — restake the principal. Interest already earned is NOT
      // included (copy-spec §1.3 optInHelp / confirmBody2): only `principal`
      // carries forward. The new term starts exactly at the OLD maturity
      // date, not at whenever the worker happens to process it (copy-spec
      // §1.3 confirmBody1: "On {maturityDate}, {principal} ... will be
      // staked again ... for another {termDays} days").
      const startAt = position.maturityAt;
      const newMaturityAt = new Date(startAt.getTime() + position.termDays * DAY_MS);

      const successor = await tx.stakePosition.create({
        data: {
          userId: position.userId,
          niaUserId: position.niaUserId,
          // `user` cannot be null here (A3-C1): a missing user row makes
          // `failReason` truthy above and returns before this point. The
          // `?? ''` fallback is unreachable defensive-typing only.
          email: user?.email ?? '',
          productId: position.productId,
          coin: position.coin,
          principal: position.principal,
          dailyRatePct: product.dailyRatePct, // "at the rate offered at that time"
          termDays: position.termDays,
          startAt,
          maturityAt: newMaturityAt,
          autoRenew: true, // inherited (PRD §6.2 per copy-spec §4.2.1)
          renewedFromPositionId: position.id,
        },
        select: { id: true },
      });

      await tx.stakePosition.update({
        where: { id: position.id },
        data: {
          status: 'MATURED',
          renewalStatus: 'RENEWED',
          renewalProcessedAt: now,
          paidAt: now,
          renewedIntoPositionId: successor.id,
        },
      });

      return { kind: 'RENEWED' as const, newPositionId: successor.id };
    });
  } catch (e) {
    console.error('[stakingRenew] matureOrRenewPosition failed for position', positionId, e);
    // Best-effort attempt counter — never let a failure to record the
    // failure itself throw out of this function.
    try {
      await prisma.stakePosition.updateMany({
        where: { id: positionId, status: 'ACTIVE' },
        data: { renewalAttempts: { increment: 1 } },
      });
    } catch (e2) {
      console.error('[stakingRenew] failed to record renewalAttempts for position', positionId, e2);
    }
    return { outcome: 'RENEWAL_DEFERRED' };
  }

  switch (txResult.kind) {
    case 'ALREADY_HANDLED':
      return { outcome: 'ALREADY_HANDLED' };
    case 'MATURED_NO_RENEWAL':
      return { outcome: 'MATURED_NO_RENEWAL' };
    case 'RENEWED':
      await sendRenewalOutcomeIfNeeded(positionId).catch((e) => {
        console.error('[stakingRenew] renewal outcome email failed for position', positionId, e);
      });
      return { outcome: 'RENEWED', newPositionId: txResult.newPositionId };
    case 'RENEWAL_FAILED':
      if (txResult.renewalStatus !== 'FAILED_ACCOUNT_INACTIVE') {
        // No email at all for a disabled account (copy-spec §4 "Never sent").
        await sendRenewalOutcomeIfNeeded(positionId).catch((e) => {
          console.error('[stakingRenew] renewal outcome email failed for position', positionId, e);
        });
      }
      return { outcome: 'RENEWAL_FAILED', renewalStatus: txResult.renewalStatus };
  }
}

/**
 * Send the renewal-outcome email for a position that has already been
 * decided (`renewalProcessedAt` set) but not yet notified
 * (`renewalNotifiedAt` null), if one is owed. Idempotent and safe to call
 * repeatedly — stamps `renewalNotifiedAt` ONLY on a successful send, so a
 * failed send is retried next call (copy-spec §4: "stamped only on a
 * successful send so a failure retries next cycle"). Used both right after
 * `matureOrRenewPosition` decides an outcome and as the retry sweep in
 * stakingSettle.ts (Pass 3).
 *
 * The retry sweep can overlap a concurrent call for the SAME position (e.g.
 * a cron run and a manual settlement run racing each other) — both would
 * pass the read-only eligibility checks below at the same time. To avoid
 * sending the email twice, the actual send is gated behind an atomic
 * `updateMany` claim (condition: `renewalNotifiedAt: null`) *before* the
 * email goes out: only the caller that flips the stamp from null wins the
 * right to send; every other concurrent caller sees `count === 0` and
 * returns without sending. If the send itself fails, the claim is released
 * back to null so the next pass retries.
 */
export async function sendRenewalOutcomeIfNeeded(positionId: string): Promise<void> {
  const position = await prisma.stakePosition.findUnique({
    where: { id: positionId },
    include: { product: { select: { name: true, minAmount: true, maxAmount: true } } },
  });
  if (!position) return;
  if (!position.renewalProcessedAt || position.renewalNotifiedAt) return;
  if (position.renewalStatus === 'NONE' || position.renewalStatus === 'FAILED_ACCOUNT_INACTIVE') return;

  const user = await prisma.user.findUnique({ where: { id: position.userId }, select: { email: true, locale: true } });
  if (!user?.email) return;

  let successor: { startAt: Date; maturityAt: Date } | null = null;
  if (position.renewalStatus === 'RENEWED') {
    if (!position.renewedIntoPositionId) return; // defensive — should never happen alongside RENEWED
    successor = await prisma.stakePosition.findUnique({
      where: { id: position.renewedIntoPositionId },
      select: { startAt: true, maturityAt: true },
    });
    if (!successor) return;
  }

  // Atomic claim — see doc comment above. Must happen before the email is
  // sent, not after, so two concurrent callers can't both pass the read
  // checks above and both send.
  const claimed = await prisma.stakePosition.updateMany({
    where: { id: positionId, renewalNotifiedAt: null },
    data: { renewalNotifiedAt: new Date() },
  });
  if (claimed.count === 0) return; // another concurrent call already claimed this send

  try {
    if (position.renewalStatus === 'RENEWED') {
      await sendRenewalOutcomeEmail(user.email, user.locale, {
        outcome: 'RENEWED',
        productName: position.product?.name ?? '',
        principal: position.principal,
        coin: position.coin,
        termDays: position.termDays,
        maturedAt: position.maturityAt,
        startAt: successor!.startAt,
        newMaturityAt: successor!.maturityAt,
      });
    } else {
      await sendRenewalOutcomeEmail(user.email, user.locale, {
        outcome: 'FAILED',
        renewalStatus: position.renewalStatus as RenewalFailureStatus,
        productName: position.product?.name ?? '',
        principal: position.principal,
        coin: position.coin,
        maturedAt: position.maturityAt,
        minAmount: position.product?.minAmount ?? null,
        maxAmount: position.product?.maxAmount ?? null,
        maxTermDays: AUTO_RENEW_MAX_TERM_DAYS,
      });
    }
  } catch (e) {
    // Send failed — release the claim so the retry sweep in
    // stakingSettle.ts (Pass 3) picks this position up again next cycle.
    await prisma.stakePosition
      .updateMany({ where: { id: positionId, renewalNotifiedAt: { not: null } }, data: { renewalNotifiedAt: null } })
      .catch((e2) => {
        console.error('[stakingRenew] failed to release renewalNotifiedAt claim for position', positionId, e2);
      });
    throw e;
  }
}
