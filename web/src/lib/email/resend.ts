import 'server-only';

import { Resend } from 'resend';
import { emailTranslator, resolveEmailLocale } from './emailLocale';
import type { RenewalFailureStatus } from '@/lib/stakingRenew';

// Server-only email sender (Resend). The API key never reaches the client.
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
const EMAIL_FROM = process.env.EMAIL_FROM ?? 'BANA Wallet <no-reply@bana.local>';
const APP_URL = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/** Format a Date in the given locale for email display (never a hardcoded en-US format). */
function fmtEmailDate(d: Date, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** True only when an email provider key is configured. */
export function isEmailConfigured(): boolean {
  return Boolean(RESEND_API_KEY);
}

/**
 * Send a password-reset email containing a one-time link.
 * Throws if email isn't configured or the provider rejects the send — callers
 * (the forgot-password route) should catch, log server-side, and still respond
 * generically so account existence is never revealed to the client.
 */
export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  if (!RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured on the server.');
  }

  const link = `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const resend = new Resend(RESEND_API_KEY);

  const { error } = await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject: 'Reset your BANA Wallet password',
    text:
      `You requested a password reset for your BANA Wallet account.\n\n` +
      `Reset your password using this link (valid for 30 minutes):\n${link}\n\n` +
      `If you didn't request this, you can safely ignore this email — your password won't change.`,
    html:
      `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto">` +
      `<h2 style="color:#0b1f3a">Reset your BANA Wallet password</h2>` +
      `<p>You requested a password reset. This link is valid for <strong>30 minutes</strong>:</p>` +
      `<p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#2E7DFF;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Reset password</a></p>` +
      `<p style="color:#64748b;font-size:13px">If you didn't request this, you can safely ignore this email — your password won't change.</p>` +
      `</div>`,
  });

  if (error) {
    throw new Error(`Resend send failed: ${error.message ?? 'unknown error'}`);
  }
}

/**
 * Send a 6-digit code to a NEW email address to verify the user owns it before
 * switching their account email. Throws if email isn't configured or the send
 * fails — the request route surfaces a clean error.
 */
export async function sendEmailChangeCode(to: string, code: string): Promise<void> {
  if (!RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured on the server.');
  }
  const resend = new Resend(RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject: `${code} is your BANA Wallet email verification code`,
    text:
      `Use this code to confirm your new BANA Wallet email address:\n\n${code}\n\n` +
      `The code is valid for 15 minutes. If you didn't request this, ignore this email.`,
    html:
      `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto">` +
      `<h2 style="color:#0b1f3a">Confirm your new email</h2>` +
      `<p>Enter this code in BANA Wallet to verify your new email address:</p>` +
      `<p style="font-size:30px;font-weight:800;letter-spacing:6px;color:#0b1f3a">${code}</p>` +
      `<p style="color:#64748b;font-size:13px">Valid for <strong>15 minutes</strong>. If you didn't request this, ignore this email.</p>` +
      `</div>`,
  });
  if (error) {
    throw new Error(`Resend send failed: ${error.message ?? 'unknown error'}`);
  }
}

// ---------------------------------------------------------------------------
// Staking auto-renew — pre-maturity reminder + renewal outcome emails.
// docs/specs/staking-auto-renew-ruling.md R-8/R-9 (ship condition: six
// locales); docs/specs/staking-auto-renew-copy-spec.md §4 is the source of
// record for the English copy and the "deliberate omissions" (no rate/APR/
// projected-earnings figure — AC-22; no one-click unauth "turn off" link).
// Localized via `emailTranslator` (User.locale, fallback `en` — see
// src/lib/email/emailLocale.ts for the fallback design). Sent post-commit,
// best-effort, from stakingRenew.ts / stakingSettle.ts — never inside the
// maturity transaction (PRD §6.4/§8.1).
// ---------------------------------------------------------------------------

export interface MaturityReminderData {
  productName: string;
  principal: string; // decimal string, rendered as-is (CLAUDE.md rule 2) — never a rate figure
  coin: string;
  termDays: number;
  maturityAt: Date;
}

/** M-1 — the mandatory pre-maturity reminder (PRD §7.1). Recipient is always
 *  `user.email`, never `position.email` (the position's email snapshot can
 *  go stale after an email change — copy-spec §4). */
export async function sendMaturityReminderEmail(
  to: string,
  userLocale: string | null | undefined,
  data: MaturityReminderData,
): Promise<void> {
  if (!RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured on the server.');
  }
  const locale = resolveEmailLocale(userLocale);
  const t = await emailTranslator(locale, 'emails.autoRenewReminder');
  const stakingUrl = `${APP_URL}/${locale}/staking`; // locale-segmented deep link — required by the [locale] route structure
  const values = {
    productName: data.productName,
    principal: data.principal,
    coin: data.coin,
    termDays: data.termDays,
    maturityDate: fmtEmailDate(data.maturityAt, locale),
  };

  const resend = new Resend(RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject: t('subject', values),
    text:
      `${t('body1', values)}\n\n` +
      `${t('body2', values)}\n\n` +
      `${t('lock')}\n\n` +
      `${t('body3', values)}\n\n` +
      `${stakingUrl}\n\n` +
      `${t('body4')}`,
    html:
      `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto">` +
      `<h2 style="color:#0b1f3a">${t('htmlIntro', values)}</h2>` +
      `<p>${t('body1', values)}</p>` +
      `<p>${t('body2', values)}</p>` +
      `<p><strong>${t('lock')}</strong></p>` +
      `<p><a href="${stakingUrl}" style="display:inline-block;padding:12px 20px;background:#2E7DFF;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">${t('cta')}</a></p>` +
      `<p style="color:#64748b;font-size:13px">${t('body3', values)} ${t('body4')}</p>` +
      `</div>`,
  });

  if (error) {
    throw new Error(`Resend send failed: ${error.message ?? 'unknown error'}`);
  }
}

export type RenewalOutcomeData =
  | {
      outcome: 'RENEWED';
      productName: string;
      principal: string;
      coin: string;
      termDays: number;
      maturedAt: Date;
      startAt: Date;
      newMaturityAt: Date;
    }
  | {
      outcome: 'FAILED';
      renewalStatus: RenewalFailureStatus;
      productName: string;
      principal: string;
      coin: string;
      maturedAt: Date;
      minAmount?: string | null;
      maxAmount?: string | null;
      maxTermDays: number;
    };

/** Sent once per maturity where renewalStatus != NONE && != FAILED_ACCOUNT_INACTIVE. */
export async function sendRenewalOutcomeEmail(
  to: string,
  userLocale: string | null | undefined,
  data: RenewalOutcomeData,
): Promise<void> {
  if (!RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured on the server.');
  }
  const locale = resolveEmailLocale(userLocale);
  const t = await emailTranslator(locale, 'emails.autoRenewOutcome');
  const stakingUrl = `${APP_URL}/${locale}/staking`;
  const resend = new Resend(RESEND_API_KEY);

  if (data.outcome === 'RENEWED') {
    const values = {
      productName: data.productName,
      principal: data.principal,
      coin: data.coin,
      termDays: data.termDays,
      maturedAt: fmtEmailDate(data.maturedAt, locale),
      startAt: fmtEmailDate(data.startAt, locale),
      newMaturityAt: fmtEmailDate(data.newMaturityAt, locale),
    };
    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject: t('renewedSubject', values),
      text:
        `${t('renewedIntro', values)}\n\n` +
        `  ${t('renewedAmountLabel')}:  ${data.principal} ${data.coin}\n` +
        `  ${t('renewedProductLabel')}:              ${data.productName}\n` +
        `  ${t('renewedTermLabel')}:             ${data.termDays}\n` +
        `  ${t('renewedStartLabel')}:     ${values.startAt}\n` +
        `  ${t('renewedEndLabel')}:       ${values.newMaturityAt}\n\n` +
        `${t('renewedInterestNote')}\n\n` +
        `${t('lock')}\n\n` +
        `${t('renewedStillOn')}\n\n` +
        `${stakingUrl}`,
      html:
        `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto">` +
        `<h2 style="color:#0b1f3a">${t('renewedSubject', values)}</h2>` +
        `<p>${t('renewedIntro', values)}</p>` +
        `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0">` +
        `<tr><td style="color:#64748b;padding:2px 0">${t('renewedAmountLabel')}</td><td style="color:#0b1f3a;text-align:right">${data.principal} ${data.coin}</td></tr>` +
        `<tr><td style="color:#64748b;padding:2px 0">${t('renewedProductLabel')}</td><td style="color:#0b1f3a;text-align:right">${data.productName}</td></tr>` +
        `<tr><td style="color:#64748b;padding:2px 0">${t('renewedTermLabel')}</td><td style="color:#0b1f3a;text-align:right">${data.termDays}</td></tr>` +
        `<tr><td style="color:#64748b;padding:2px 0">${t('renewedStartLabel')}</td><td style="color:#0b1f3a;text-align:right">${values.startAt}</td></tr>` +
        `<tr><td style="color:#64748b;padding:2px 0">${t('renewedEndLabel')}</td><td style="color:#0b1f3a;text-align:right">${values.newMaturityAt}</td></tr>` +
        `</table>` +
        `<p>${t('renewedInterestNote')}</p>` +
        `<p><strong>${t('lock')}</strong></p>` +
        `<p><a href="${stakingUrl}" style="display:inline-block;padding:12px 20px;background:#2E7DFF;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">${t('cta')}</a></p>` +
        `<p style="color:#64748b;font-size:13px">${t('renewedStillOn')}</p>` +
        `</div>`,
    });
    if (error) throw new Error(`Resend send failed: ${error.message ?? 'unknown error'}`);
    return;
  }

  // Not renewed — per-status reason sentence (copy-spec §4.2.2).
  const reasonT = await emailTranslator(locale, 'emails.autoRenewOutcome.reason');
  const reasonValues = {
    productName: data.productName,
    maxTermDays: data.maxTermDays,
    minAmount: data.minAmount ?? '',
    maxAmount: data.maxAmount ?? '',
    coin: data.coin,
  };
  const reasonSentence = (reasonT as unknown as (key: string, values?: Record<string, unknown>) => string)(
    data.renewalStatus,
    reasonValues,
  );
  const values = {
    productName: data.productName,
    maturedAt: fmtEmailDate(data.maturedAt, locale),
    principal: data.principal,
    coin: data.coin,
  };
  const { error } = await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject: t('notRenewedSubject', values),
    text:
      `${t('notRenewedIntro', values)}\n\n` +
      `${reasonSentence}\n\n` +
      `${t('notRenewedPrincipalAvailable', values)}\n\n` +
      `${t('notRenewedCta')}\n\n` +
      `${stakingUrl}`,
    html:
      `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto">` +
      `<h2 style="color:#0b1f3a">${t('notRenewedSubject', values)}</h2>` +
      `<p>${t('notRenewedIntro', values)}</p>` +
      `<p>${reasonSentence}</p>` +
      `<p>${t('notRenewedPrincipalAvailable', values)}</p>` +
      `<p><a href="${stakingUrl}" style="display:inline-block;padding:12px 20px;background:#2E7DFF;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">${t('cta')}</a></p>` +
      `<p style="color:#64748b;font-size:13px">${t('notRenewedCta')}</p>` +
      `</div>`,
  });
  if (error) throw new Error(`Resend send failed: ${error.message ?? 'unknown error'}`);
}
