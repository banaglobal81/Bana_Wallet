// Auto-renew — pure, no I/O, NO `import 'server-only'` deliberately (mirrors
// this repo's existing referralBonus.ts / referralBonusMath.ts and
// deepCoreProgress.ts / deepCoreProgressMath.ts splits) — so the eligibility
// decision is directly unit-testable (stakingRenewMath.test.ts) without
// mocking Prisma. `stakingRenew.ts` is the thin `server-only` I/O wrapper
// that fetches the position/product/user rows and calls straight into
// `decideRenewalEligibility` below, then writes the result.
//
// NOTE (discovered while wiring this up): web/vitest.config.ts aliases
// `server-only` to `./src/test/stubs/server-only.ts`, but that stub file
// does not exist in the repo, so any file that imports 'server-only'
// directly currently fails to load under vitest. This split routes around
// that gap the same way the rest of the codebase already does; the missing
// stub itself is unrelated to auto-renew and out of this task's scope.
//
// Every business rule in this module was, at one point, marked ASSUMPTION
// pending the (still-missing) parent PRD/ruling docs. All of them have since
// been closed by `docs/specs/staking-auto-renew-assumption-ruling.md`
// (`pm`, AUTHORITATIVE RULING, 2026-08-10) — read that document for the
// reasoning; the comments below only cite its conclusions.
import Decimal from 'decimal.js';

/**
 * The auto-renew term cap, in days (ruling R-2/R-3 per
 * docs/specs/staking-auto-renew-copy-spec.md §0.4): a position may only be
 * offered/keep auto-renew while `termDays <= 90`. Named code constant, NOT
 * an env var, NOT admin-editable. Every string that renders this number does
 * so via `{maxTermDays}`, sourced from this constant — never hardcode "90"
 * elsewhere (copy-spec §7 F-7: this constant and stakingSettle.ts's reminder
 * lead-time table must agree; stakingSettle.ts already derives its boundary
 * from this constant rather than a second literal).
 */
export const AUTO_RENEW_MAX_TERM_DAYS = 90;

/**
 * Pre-maturity reminder lead time by term length (PRD §7.1, M-1 — mandatory
 * ship condition; copy-spec §7 F-7: this table and AUTO_RENEW_MAX_TERM_DAYS
 * above must agree, which is why it derives its boundary from that constant
 * rather than a second hardcoded "90"). The `> AUTO_RENEW_MAX_TERM_DAYS` row
 * is a DEFENSIVE BRANCH ONLY — unreachable through the offering while the
 * 90-day cap is in force (R-2) — kept so a downward cap change or a direct DB
 * write is still covered; keep it OUT of the product description (ruling
 * §2.3).
 *
 * Moved here (rev05 CUT-3, T-6) from stakingSettle.ts's Pass 2 — this is now
 * the single source of truth both the legacy engine (stakingSettle.ts) and
 * the V2 engine (stakingV2.ts's runStakingSettlementV2) import, so the two
 * can never silently disagree on when a reminder is due. `DAY_MS` is passed
 * in rather than imported from stakingMath.ts, keeping this module free of
 * any import (this file deliberately has none — see header comment — so it
 * stays trivially unit-testable without a database or 'server-only').
 */
export function reminderLeadMs(termDays: number, dayMs: number): number {
  if (termDays <= 10) return dayMs * 1;
  if (termDays <= AUTO_RENEW_MAX_TERM_DAYS) return dayMs * 3;
  return dayMs * 7;
}

/**
 * Every non-NONE, non-RENEWED value `StakePosition.renewalStatus` can take
 * where the renewal was refused AND an outcome email is owed. Deliberately
 * EXCLUDES `FAILED_ACCOUNT_INACTIVE`: copy-spec §4 "Never sent" table says
 * that status gets no outcome email at all — this is the type
 * `web/src/lib/email/resend.ts` imports as `RenewalFailureStatus` for its
 * `RenewalOutcomeData` union.
 */
export type RenewalFailureStatus =
  | 'FAILED_PRODUCT_CLOSED'
  | 'FAILED_TERM_TOO_LONG'
  | 'FAILED_CAPACITY'
  | 'FAILED_BELOW_MIN'
  | 'FAILED_ABOVE_MAX'
  | 'FAILED_RATE_LOWERED'
  | 'FAILED_TERMS_CHANGED'
  | 'FAILED_GRANTED_POSITION'
  | 'FAILED_SYSTEM';

/** `renewalStatus` value that also suppresses the outcome email (silent). */
export type SilentFailureStatus = 'FAILED_ACCOUNT_INACTIVE';

export type AnyFailureStatus = RenewalFailureStatus | SilentFailureStatus;

/** Pure input snapshot for the eligibility decision. */
export interface RenewalEligibilityInput {
  userDisabled: boolean;
  grantedByAdminId: string | null;
  positionTermDays: number;
  positionPrincipal: string; // decimal string
  positionDailyRatePct: string; // decimal string, snapshotted rate on the position
  // A2-C1 (ruling §2): `coin` is a product snapshot carried forward onto the
  // successor unchanged, exactly like `termDays` — must be compared alongside
  // it for E8 (FAILED_TERMS_CHANGED).
  positionCoin: string;
  productStatus: string; // StakingProductStatus, compared as string
  productTermDays: number;
  productDailyRatePct: string; // decimal string, product's CURRENT rate
  productCoin: string;
  productMinAmount: string | null;
  productMaxAmount: string | null;
  productCapacity: string | null;
  /** Sum of principal on OTHER ACTIVE positions for this product (the
   *  position being renewed must be excluded by the caller — it is still
   *  ACTIVE at decision time and would otherwise double-count itself). */
  productActivePrincipalExcludingSelf: string;
}

/**
 * The ordered eligibility check for the ON-ramp at maturity time. Returns the
 * first failing reason, or `null` if the renewal may proceed.
 *
 * Check order settled by `docs/specs/staking-auto-renew-assumption-ruling.md`
 * §1.2 (APPROVED as implemented, no logic change from what this function
 * already did — see that document for the full reasoning, including why the
 * "E9" schema label does NOT mean "run last"):
 *  1. Account disabled (ruling §3 / A3 — the only account-state flag on
 *     `User`; matches "cannot get in to cancel the renewal") — placed first
 *     because copy-spec §4 treats it as a wholly separate "no email at all"
 *     case, distinct from the E-numbered refusals below.
 *  2. Grant exclusion — ruling §1: a guard for a broken invariant (a granted
 *     position should never reach maturity with autoRenew=true through any
 *     supported path), and guards run before rules that assume the invariant
 *     holds. Also consistent with the live PATCH route's own check order.
 *  3. E2a — term cap (copy-spec §2.2 check 7 / AC-29: "fires before E3/E4").
 *  4. E3 — product closed to new stakes.
 *  5. E4 — product's current rate lower than the rate on the position
 *     (copy-spec §4.3: the new rate is always >= the old one).
 *  6. E5 — below the product's current minimum.
 *  7. E6 — above the product's current maximum.
 *  8. E7 — capacity: restaking would exceed the product's capacity cap.
 *  9. E8 — ruling §2 (APPROVED, with the A2-C1 scope widening below): fires
 *     when a product attribute the position snapshotted at stake time, and
 *     the successor carries forward unchanged, no longer matches the
 *     product's current value. That set is exactly `termDays` and `coin`
 *     (A2-C1) — `dailyRatePct` is excluded because it is snapshotted but
 *     deliberately NOT carried forward (the successor takes the product's
 *     current rate; its own mismatch case is E4). Defensive/currently
 *     unreachable: neither `termDays` nor `coin` has an admin edit path
 *     today (the admin edit panel only exposes
 *     name/dailyRatePct/minAmount/maxAmount/capacity —
 *     `web/src/app/[locale]/admin/staking/page.tsx` `editForm`). Kept for
 *     the same reason stakingSettle.ts keeps its own unreachable `> 90`
 *     reminder-lead branch.
 */
export function decideRenewalEligibility(input: RenewalEligibilityInput): AnyFailureStatus | null {
  if (input.userDisabled) return 'FAILED_ACCOUNT_INACTIVE';
  if (input.grantedByAdminId != null) return 'FAILED_GRANTED_POSITION';
  if (input.positionTermDays > AUTO_RENEW_MAX_TERM_DAYS) return 'FAILED_TERM_TOO_LONG';
  if (input.productStatus !== 'OPEN') return 'FAILED_PRODUCT_CLOSED';
  if (new Decimal(input.productDailyRatePct || '0').lt(new Decimal(input.positionDailyRatePct || '0'))) {
    return 'FAILED_RATE_LOWERED';
  }
  if (input.productMinAmount && new Decimal(input.positionPrincipal).lt(new Decimal(input.productMinAmount))) {
    return 'FAILED_BELOW_MIN';
  }
  if (input.productMaxAmount && new Decimal(input.positionPrincipal).gt(new Decimal(input.productMaxAmount))) {
    return 'FAILED_ABOVE_MAX';
  }
  if (input.productCapacity) {
    const used = new Decimal(input.productActivePrincipalExcludingSelf || '0').plus(input.positionPrincipal);
    if (used.gt(new Decimal(input.productCapacity))) return 'FAILED_CAPACITY';
  }
  // A2-C1: both termDays and coin are position snapshots carried forward
  // unchanged onto the successor — either mismatching the product's current
  // value trips the same structural E8 reason.
  if (input.productTermDays !== input.positionTermDays) return 'FAILED_TERMS_CHANGED';
  if (input.productCoin !== input.positionCoin) return 'FAILED_TERMS_CHANGED';
  return null;
}
