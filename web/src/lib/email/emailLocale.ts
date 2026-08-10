import 'server-only';
import { createTranslator } from 'next-intl';
import { routing } from '@/i18n/routing';

// ---------------------------------------------------------------------------
// Minimal, request-context-free localization for server-emitted email (the
// staking auto-renew reminder + outcome emails — see
// docs/specs/staking-auto-renew-ruling.md R-8/R-9). Deliberately NOT the full
// next-intl request pipeline (`getRequestConfig` / `NextIntlClientProvider`):
// these emails are sent by the settlement worker, which has no HTTP request
// to derive a locale from — the only source is the persisted `User.locale`
// column. `next-intl`'s `createTranslator` is a plain function that takes a
// locale + a messages object directly, with no React/request dependency, so
// it's a perfect fit for exactly this "translate outside of components" case
// without pulling in anything request-scoped.
// ---------------------------------------------------------------------------

type Messages = Record<string, unknown>;

async function loadMessages(locale: string): Promise<Messages> {
  // Mirrors the relative-path pattern already used in src/i18n/request.ts
  // (messages/ lives at the repo root, three levels up from src/lib/email/).
  return (await import(`../../../messages/${locale}.json`)).default as Messages;
}

function getNested(obj: Messages, dottedPath: string): unknown {
  return dottedPath.split('.').reduce<unknown>((acc, seg) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[seg];
    return undefined;
  }, obj);
}

/**
 * Returns a next-intl translator scoped to `namespace`, resolved for
 * `locale` (falling back to `en` for an unsupported/null locale — R-8).
 *
 * Whole-namespace fallback: if the target locale's message file doesn't yet
 * have `namespace` (e.g. translation for these two email templates hasn't
 * landed for that locale yet), the WHOLE namespace falls back to English
 * rather than emitting a mix of translated/untranslated fragments or a raw
 * missing-key placeholder. This keeps the sender safe to call the moment any
 * one locale's content exists, while `ui-ux-designer` fills in the rest —
 * once a locale's `emails.*` keys are added, this function picks them up
 * automatically with no code change.
 */
export async function emailTranslator(locale: string | null | undefined, namespace: string) {
  const resolved = locale && (routing.locales as readonly string[]).includes(locale) ? locale : routing.defaultLocale;
  const [localeMessages, enMessages] = await Promise.all([
    loadMessages(resolved).catch(() => ({} as Messages)),
    resolved === 'en' ? Promise.resolve(null) : loadMessages('en'),
  ]);
  const hasNamespace = getNested(localeMessages, namespace) != null;
  const messages = hasNamespace ? localeMessages : (enMessages ?? localeMessages);
  return createTranslator({
    locale: hasNamespace ? resolved : 'en',
    messages,
    namespace,
    // Never throw / spam stderr for a genuinely missing key inside an
    // otherwise-present namespace — fall back to the key path (default
    // next-intl behaviour) instead of crashing an email send.
    onError: () => {},
  });
}

/** Resolve a possibly-null User.locale to one of the six supported locales. */
export function resolveEmailLocale(locale: string | null | undefined): string {
  return locale && (routing.locales as readonly string[]).includes(locale) ? locale : routing.defaultLocale;
}
