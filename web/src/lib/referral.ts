import 'server-only';
import crypto from 'node:crypto';
import { prisma } from '@/lib/db';

// Referral-code helpers (Phase A). A code is a short, URL-safe, human-friendly
// string used to attribute a signup to the inviter. NO commission math here.

// Crockford-ish alphabet: no 0/O/1/I/L to avoid confusion when typed/shared.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateReferralCode(len = 8): string {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** A referral code guaranteed not to collide with an existing one. */
export async function uniqueReferralCode(): Promise<string> {
  for (let i = 0; i < 6; i += 1) {
    const code = generateReferralCode();
    const exists = await prisma.user.findUnique({ where: { referralCode: code }, select: { id: true } });
    if (!exists) return code;
  }
  // Astronomically unlikely to get here; fall back to a longer code.
  return generateReferralCode(12);
}

/** Return the user's referral code, generating + persisting one if missing. */
export async function ensureReferralCode(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
  if (u?.referralCode) return u.referralCode;
  const code = await uniqueReferralCode();
  await prisma.user.update({ where: { id: userId }, data: { referralCode: code } });
  return code;
}

/** Resolve a referral code to the inviter's user id (null if invalid). */
export async function resolveReferrer(code: string | undefined | null): Promise<string | null> {
  const clean = String(code ?? '').trim().toUpperCase();
  if (!clean) return null;
  const u = await prisma.user.findUnique({ where: { referralCode: clean }, select: { id: true } });
  return u?.id ?? null;
}
