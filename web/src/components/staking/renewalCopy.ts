// Shared auto-renew copy/eligibility logic, used by both the page-level B5
// inline notice (docs/specs/staking-page-v2-screen-flow-frd.md §4.7 #4) and
// the S-POS per-position outcome line (§4.5) — kept in one place so the two
// surfaces never drift on wording or the eligibility rules. Moved out of
// Staking.tsx verbatim during the v2 restructure (no logic change).
import type { useTranslations } from 'next-intl';
import type { StakePosition, StakingProduct } from '../../utils/stakingApi';

// docs/specs/staking-auto-renew-prd.md R-3 / ruling §2.3 — the 90-day cap on
// auto-renew eligibility. The canonical constant lives server-side in
// src/lib/stakingRenew.ts (`AUTO_RENEW_MAX_TERM_DAYS`), which is
// `import 'server-only'` and therefore cannot be imported into this client
// component. Duplicated here as a plain literal per R-3's own wording — "a
// named constant in code", not an env var, not admin-editable. Raising it is
// a visible code change on both sides, never a config flip.
export const AUTO_RENEW_MAX_TERM_DAYS = 90;

// S3 — dismissal is per-position localStorage, keyed exactly as PRD §4 S3
// specifies: `bana.renewalNotice.<positionId>`.
const RENEWAL_NOTICE_DISMISS_PREFIX = 'bana.renewalNotice.';
// S3 window: positions with a renewal outcome processed within the last 14 days.
export const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export function isRenewalNoticeDismissed(positionId: string): boolean {
  if (typeof window === 'undefined') return false;
  try { return window.localStorage.getItem(RENEWAL_NOTICE_DISMISS_PREFIX + positionId) === '1'; } catch { return false; }
}
export function dismissRenewalNotices(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try { ids.forEach((id) => window.localStorage.setItem(RENEWAL_NOTICE_DISMISS_PREFIX + id, '1')); } catch { /* ignore */ }
}

export function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

/** Just enough of `useTranslations`'s return shape for these helpers. */
export type Translator = ReturnType<typeof useTranslations>;

// PATCH .../auto-renew's stable error codes -> the staking.autoRenew.error.*
// keys (copy spec §2.4). AUTO_RENEW_TERM_TOO_LONG needs {termDays} from the
// specific position being acted on, so this takes the position in.
export function localizeAutoRenewError(err: Error & { code?: string }, ar: Translator, position: StakePosition): string {
  switch (err.code) {
    case 'INVALID_REQUEST': return ar('error.INVALID_REQUEST');
    case 'POSITION_NOT_FOUND': return ar('error.POSITION_NOT_FOUND');
    case 'POSITION_NOT_ACTIVE': return ar('error.POSITION_NOT_ACTIVE');
    case 'AUTO_RENEW_GRANTED_POSITION': return ar('error.AUTO_RENEW_GRANTED_POSITION');
    case 'AUTO_RENEW_TERM_TOO_LONG': return ar('error.AUTO_RENEW_TERM_TOO_LONG', { maxTermDays: AUTO_RENEW_MAX_TERM_DAYS, termDays: position.termDays });
    default: return err.message || 'Request failed.';
  }
}

// §8.2 / copy spec — renewalStatus -> heading + body. `RENEWED` reads the
// successor position's own term/rate/start (the new term), not the matured
// position's own snapshot values.
export function outcomeFor(
  p: StakePosition,
  positions: StakePosition[],
  products: StakingProduct[],
  ar: Translator,
): { heading: string; body: string; renewed: boolean; successor?: StakePosition } {
  if (p.renewalStatus === 'RENEWED') {
    const successor = positions.find((x) => x.id === p.renewedIntoPositionId);
    return {
      heading: ar('renewedHeading'),
      body: ar('renewedCopy', {
        principal: p.principal,
        coin: p.coin,
        productName: p.productName,
        termDays: successor?.termDays ?? p.termDays,
        dailyRatePct: successor?.dailyRatePct ?? p.dailyRatePct,
        startAt: fmtDate(successor?.startAt ?? p.maturityAt),
      }),
      renewed: true,
      successor,
    };
  }
  // Live product lookup (products list is OPEN-only, but FAILED_BELOW_MIN /
  // FAILED_ABOVE_MAX / FAILED_RATE_LOWERED only occur when the product was
  // OPEN at renewal time, so it's usually present). The server does not
  // snapshot the failure-time min/max/rate anywhere, so this is a
  // best-effort current-value approximation — see report to the parent
  // agent for the exact gap.
  const product = products.find((pr) => pr.id === p.productId);
  const base = { productName: p.productName, principal: p.principal, coin: p.coin };
  switch (p.renewalStatus) {
    case 'FAILED_PRODUCT_CLOSED':
      return { heading: ar('notRenewedHeading'), body: ar('notRenewedClosedCopy', base), renewed: false };
    case 'FAILED_TERM_TOO_LONG':
      return { heading: ar('notRenewedHeading'), body: ar('notRenewedTermTooLongCopy', { ...base, maxTermDays: AUTO_RENEW_MAX_TERM_DAYS }), renewed: false };
    case 'FAILED_CAPACITY':
      return { heading: ar('notRenewedHeading'), body: ar('notRenewedCapacityCopy', base), renewed: false };
    case 'FAILED_BELOW_MIN':
      return { heading: ar('notRenewedHeading'), body: ar('notRenewedBelowMinCopy', { ...base, minAmount: product?.minAmount ?? '' }), renewed: false };
    case 'FAILED_ABOVE_MAX':
      return { heading: ar('notRenewedHeading'), body: ar('notRenewedAboveMaxCopy', { ...base, maxAmount: product?.maxAmount ?? '' }), renewed: false };
    case 'FAILED_RATE_LOWERED':
      return { heading: ar('notRenewedHeading'), body: ar('notRenewedRateLoweredCopy', { ...base, dailyRatePct: product?.dailyRatePct ?? p.dailyRatePct, oldRate: p.dailyRatePct }), renewed: false };
    case 'FAILED_TERMS_CHANGED':
      return { heading: ar('notRenewedHeading'), body: ar('notRenewedTermsChangedCopy', base), renewed: false };
    case 'FAILED_SYSTEM':
    case 'FAILED_GRANTED_POSITION':
      return { heading: ar('notRenewedHeading'), body: ar('notRenewedSystemErrorCopy', base), renewed: false };
    default:
      return { heading: '', body: '', renewed: false };
  }
}
