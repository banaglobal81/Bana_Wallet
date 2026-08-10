import 'server-only';

// A-5 §2.8 — read-only RPC/explorer endpoints. No signing/private-key/mnemonic
// items exist in this list, by design (non-custodial execution — A-5 §4). Same
// "read once at module load, empty string means unset" pattern as
// web/src/lib/nia/config.ts.
export const BSC_RPC_URL = process.env.BSC_RPC_URL ?? '';
export const BSC_RPC_URL_FALLBACK = process.env.BSC_RPC_URL_FALLBACK ?? '';
export const BSCSCAN_API_BASE_URL = process.env.BSCSCAN_API_BASE_URL ?? '';
export const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY ?? '';

// BSC mainnet public RPC endpoints, used as the fallback chain when BSC_RPC_URL /
// BSC_RPC_URL_FALLBACK are unset, or as additional retry targets when a configured
// endpoint fails a given call. Order matters (tried first-to-last). These are
// well-known third-party public endpoints, not BANA infrastructure — fine for
// read-only calls (balanceOf / eth_getTransactionReceipt / etc), never for
// anything that would leak a secret (nothing here ever does — read-only client).
//
// RESIDUAL RISK (A-5 §2.7, wallet-security-expert review, undecided-by-design):
// these are third-party, operator-uncontrolled nodes. `rpc.ts` implements
// "sequential fallback, first success wins" — the §2.7 minimum requirement — NOT
// dual-source cross-verification. A public endpoint that is compromised,
// misbehaving, or fed a stale/forked view of the chain could cause a withdrawal
// verification to observe a wrong-but-internally-consistent receipt/log/
// block-height with no second source to catch the discrepancy. §2.7 explicitly left
// "adopt dual-source cross-verification?" undecided ("권고했으나 확정하지 않았다") —
// this is an accepted, documented gap, not an oversight. Mitigations in place today:
// (1) operators are expected to set `BSC_RPC_URL` to a trusted provider, which is
// always tried first; (2) `classifyBscRpcEndpoints()` / `jsonRpcCallWithSource()`
// below record which endpoint class (configured vs public fallback) actually
// answered each call, so a public-fallback-sourced verification PASS is
// distinguishable in the audit trail (WITHDRAWAL_ONCHAIN_VERIFIED_VIA_PUBLIC_RPC,
// web/src/lib/withdrawalOnchain.ts) for manual review, rather than silently
// indistinguishable from a primary-sourced one. Full dual-source
// cross-verification remains an open wallet-security-expert decision.
export const PUBLIC_BSC_RPC_ENDPOINTS = [
  'https://bsc-dataseed.binance.org/',
  'https://bsc-dataseed1.defibit.io/',
  'https://bsc-dataseed1.ninicoin.io/',
  'https://bsc-dataseed2.binance.org/',
];

/**
 * Ordered, deduplicated list of RPC endpoints to try for a single JSON-RPC call:
 * explicit env config first (BSC_RPC_URL, then BSC_RPC_URL_FALLBACK), then the
 * public defaults. Never empty — the public list guarantees at least one entry.
 */
export function resolveBscRpcEndpoints(): string[] {
  const configured = [BSC_RPC_URL, BSC_RPC_URL_FALLBACK].filter(Boolean);
  return Array.from(new Set([...configured, ...PUBLIC_BSC_RPC_ENDPOINTS]));
}

/**
 * Classifies each resolveBscRpcEndpoints() entry as 'configured' (operator-supplied
 * via BSC_RPC_URL / BSC_RPC_URL_FALLBACK — may embed an API key in the URL) or
 * 'public' (the well-known PUBLIC_BSC_RPC_ENDPOINTS list). Consumed by
 * jsonRpcCallWithSource() (./rpc.ts) to build anonymous audit-log labels
 * (e.g. "configured#1", "public#2") — the actual URL is never included in a label,
 * error message, or anything persisted/returned to a client (A-5 §2.7 audit
 * requirement + wallet-security-expert URL-leak finding).
 */
export function classifyBscRpcEndpoints(): Array<{ url: string; kind: 'configured' | 'public' }> {
  const configured = new Set([BSC_RPC_URL, BSC_RPC_URL_FALLBACK].filter(Boolean));
  return resolveBscRpcEndpoints().map((url) => ({ url, kind: configured.has(url) ? 'configured' : 'public' }));
}

/**
 * True once at least one RPC endpoint (explicit or public default) is available.
 * Always true today since PUBLIC_BSC_RPC_ENDPOINTS is non-empty — kept as a named
 * check for callers/future "explicit-endpoint-only" deployment modes, and so a
 * future change that empties the public list fails this check instead of silently
 * calling resolveBscRpcEndpoints() with zero entries.
 */
export function isOnchainVerifyConfigured(): boolean {
  return resolveBscRpcEndpoints().length > 0;
}
