import 'server-only';
import { generateSecret, generateURI, verify } from 'otplib';
import { randomBytes } from 'node:crypto';
import { sha256Hex } from './crypto';

// otplib v13 dropped the `authenticator` singleton (and its `.options.window`
// steps-based knob) for a functional API where tolerance is passed per call,
// in seconds. ±1 legacy "step" at the default 30s period == ±30s.
const EPOCH_TOLERANCE_SECONDS = 30;

export const TOTP_ISSUER = 'BANA Wallet';

/** New base32 TOTP secret for enrollment (Google Authenticator compatible). */
export function generateTotpSecret(): string {
  return generateSecret();
}

/** otpauth:// URI encoded into the enrollment QR code. */
export function totpKeyUri(accountLabel: string, secret: string): string {
  return generateURI({ issuer: TOTP_ISSUER, label: accountLabel, secret });
}

/** Verify a 6-digit code against the secret. */
export async function verifyTotp(token: string, secret: string): Promise<boolean> {
  const t = String(token).replace(/\D/g, '');
  if (t.length !== 6) return false;
  try {
    const result = await verify({ secret, token: t, epochTolerance: EPOCH_TOLERANCE_SECONDS });
    return result.valid;
  } catch {
    return false;
  }
}

/** Backup codes: shown to the user once (plaintext), stored as SHA-256 hashes. */
export function generateBackupCodes(count = 10): { plain: string[]; hashed: string[] } {
  const plain = Array.from({ length: count }, () => {
    const raw = randomBytes(5).toString('hex'); // 10 hex chars
    return `${raw.slice(0, 5)}-${raw.slice(5)}`; // e.g. a1b2c-3d4e5
  });
  return { plain, hashed: plain.map((c) => sha256Hex(c.replace(/[^a-z0-9]/gi, '').toLowerCase())) };
}

/** If `input` matches an unused backup code, return its hash (to consume it). */
export function matchBackupCode(input: string, hashed: string[]): string | null {
  const norm = String(input).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!norm) return null;
  const h = sha256Hex(norm);
  return hashed.includes(h) ? h : null;
}
