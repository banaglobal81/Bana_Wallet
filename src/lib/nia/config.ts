import 'server-only';

// Read env vars once at module load time.
// All values are strings; empty string means "not set".
export const NIA_API_KEY = process.env.NIA_API_KEY ?? '';
export const NIA_API_SECRET = process.env.NIA_API_SECRET ?? '';
export const NIA_BROKER_ID = process.env.NIA_BROKER_ID ?? '';
export const NIA_BASE_URL = process.env.NIA_BASE_URL ?? 'https://api.niawallet.com';
export const NIA_DEFAULT_USER_ID = process.env.NIA_DEFAULT_USER_ID ?? '';
export const NIA_WEBHOOK_SECRET = process.env.NIA_WEBHOOK_SECRET ?? '';

/**
 * Returns true only when both API key and secret are set.
 * Used to gate all signed requests.
 */
export function isConfigured(): boolean {
  return Boolean(NIA_API_KEY && NIA_API_SECRET);
}
