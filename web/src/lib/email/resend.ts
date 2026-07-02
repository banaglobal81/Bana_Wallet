import 'server-only';

import { Resend } from 'resend';

// Server-only email sender (Resend). The API key never reaches the client.
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
const EMAIL_FROM = process.env.EMAIL_FROM ?? 'BANA Wallet <no-reply@bana.local>';
const APP_URL = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

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
