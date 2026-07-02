import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

// AES-256-GCM encryption for sensitive values stored at rest (e.g. the TOTP
// secret). The key is derived from AUTH_SECRET (server-only). Rotating
// AUTH_SECRET invalidates existing ciphertexts — acceptable, users re-enroll 2FA.
function key(): Buffer {
  const s = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET is not set — cannot encrypt/decrypt secrets.');
  return createHash('sha256').update(s).digest(); // 32 bytes
}

/** Encrypt a UTF-8 string → "iv:authTag:ciphertext" (all base64). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
}

/** Decrypt a payload produced by encryptSecret(). Throws if tampered/invalid. */
export function decryptSecret(payload: string): string {
  const [iv, tag, enc] = payload.split(':');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]).toString('utf8');
}

/** Stable hex SHA-256 — used to store backup codes without the plaintext. */
export function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
