import 'server-only';
import { authenticator } from 'otplib';
import { randomBytes } from 'node:crypto';
import { sha256Hex } from './crypto';

// Allow ±1 time step (±30s) for clock drift between the phone and server.
authenticator.options = { window: 1 };

export const TOTP_ISSUER = 'BANA Wallet';

/** New base32 TOTP secret for enrollment (Google Authenticator compatible). */
export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

/** otpauth:// URI encoded into the enrollment QR code. */
export function totpKeyUri(accountLabel: string, secret: string): string {
  return authenticator.keyuri(accountLabel, TOTP_ISSUER, secret);
}

/** Verify a 6-digit code against the secret. */
export function verifyTotp(token: string, secret: string): boolean {
  const t = String(token).replace(/\D/g, '');
  if (t.length !== 6) return false;
  try {
    return authenticator.verify({ token: t, secret });
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
