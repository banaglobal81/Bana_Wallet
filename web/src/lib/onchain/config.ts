import 'server-only';

// A-5 §2.8 — read-only RPC/explorer endpoints. No signing/private-key/mnemonic
// items exist in this list, by design (non-custodial execution — A-5 §4). Same
// "read once at module load, empty string means unset" pattern as
// web/src/lib/nia/config.ts.
export const BSC_RPC_URL = process.env.BSC_RPC_URL ?? '';
export const BSC_RPC_URL_FALLBACK = process.env.BSC_RPC_URL_FALLBACK ?? '';
export const BSCSCAN_API_BASE_URL = process.env.BSCSCAN_API_BASE_URL ?? '';
export const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY ?? '';

/** True only once a primary RPC endpoint is configured. */
export function isOnchainVerifyConfigured(): boolean {
  return Boolean(BSC_RPC_URL);
}
