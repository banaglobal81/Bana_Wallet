import { routing, type Locale } from './routing';

/**
 * Short-lived, one-shot cookie carrying the active next-intl locale across a
 * sign-in redirect (credentials / passkey / Google), per
 * docs/specs/staking-auto-renew-ruling.md R-8 ("refreshed on each successful
 * login from the active next-intl locale").
 *
 * Why a cookie and not a `locale` field threaded through every NextAuth
 * provider: `/api/auth/*` routes are NOT under the `[locale]` segment, so the
 * Node-only `jwt()` callback in src/auth.ts (the one place common to all
 * three sign-in methods) has no request-locale context of its own. The login/
 * signup pages ARE under `[locale]` and know the active locale via
 * `useLocale()`, so they write it into this cookie right before calling
 * `signIn(...)` (or, for signup, before/alongside the initial account-create
 * POST); the server reads it back in `auth.ts` and clears it.
 */
export const LOCALE_COOKIE = 'bana_locale';

/** Client-only: call right before invoking `signIn()` (or account creation)
 *  from any page under `[locale]`. No-op outside the browser. */
export function writeLocaleCookie(locale: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(locale)}; path=/; max-age=300; SameSite=Lax`;
}

/** Validate an arbitrary cookie value against the supported locale list. */
export function parseLocaleCookie(value: string | undefined | null): Locale | null {
  return value && (routing.locales as readonly string[]).includes(value) ? (value as Locale) : null;
}
