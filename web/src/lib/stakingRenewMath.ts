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
  productStatus: string; // StakingProductStatus, compared as string
  productTermDays: number;
  productDailyRatePct: string; // decimal string, product's CURRENT rate
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
 * ASSUMPTION — reconstructed order (the parent docs
 * `docs/specs/staking-auto-renew-prd.md` / `staking-auto-renew-ruling.md`
 * that the copy-spec cites are NOT present in this repo; see
 * `stakingRenew.ts`'s module header for the full caveat):
 *  1. Account disabled (ruling R-9 per schema.prisma:311's "R-5/R-6/R-9, E9")
 *     — placed first because copy-spec §4 treats it as a wholly separate
 *     "no email at all" case, distinct from the E-numbered refusals below.
 *  2. Grant exclusion (schema.prisma labels this "E9", i.e. last in the
 *     PRD's own numbering — but the live PATCH route,
 *     `api/staking/positions/[id]/auto-renew/route.ts` checks 6/7, checks
 *     grant BEFORE the term cap for the opt-in gate; placed here right
 *     after the disabled check, ahead of E2a, to stay consistent with that
 *     precedent. Flag to `pm`/`product-planner` once the PRD is available.)
 *  3. E2a — term cap (copy-spec §2.2 check 7 / AC-29: "fires before E3/E4").
 *  4. E3 — product closed to new stakes.
 *  5. E4 — product's current rate lower than the rate on the position
 *     (copy-spec §4.3: the new rate is always >= the old one).
 *  6. E5 — below the product's current minimum.
 *  7. E6 — above the product's current maximum.
 *  8. E7 — capacity: restaking would exceed the product's capacity cap.
 *  9. E8 (ASSUMPTION — unlabeled in available docs) — the product's term
 *     length changed since this position was created. Defensive/currently
 *     unreachable: `StakingProduct.termDays` has no admin edit path today
 *     (the admin edit panel only exposes name/dailyRatePct/minAmount/
 *     maxAmount/capacity — `web/src/app/[locale]/admin/staking/page.tsx`
 *     `editForm`). Kept for the same reason stakingSettle.ts keeps its own
 *     unreachable `> 90` reminder-lead branch.
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
  if (input.productTermDays !== input.positionTermDays) return 'FAILED_TERMS_CHANGED';
  return null;
}
