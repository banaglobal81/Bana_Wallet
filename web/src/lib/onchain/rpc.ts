import 'server-only';

// A-3 §4.5 / A-5 §2.8 follow-up — the actual JSON-RPC dependency (fetch) for
// read-only BSC calls (eth_call / eth_getTransactionReceipt / eth_getTransactionByHash
// / eth_blockNumber). Pure calldata-encoding/response-decoding helpers live in
// server/core/onchain-verify.js (harness-testable); this file owns the real network
// call, mirroring the nia-signing.js / client.ts split (docs/architecture/harness.md).
//
// SECURITY (A-5 §2.1/§4): read-only only. No eth_sendRawTransaction / personal_sign /
// signing/private-key/mnemonic code may ever be added to this file. Every change here
// requires a wallet-security-expert review (A-5 §2.2).
//
// Failure contract: jsonRpcCall()/jsonRpcCallWithSource() NEVER return a made-up/
// default value on failure — they always throw, and try every endpoint in
// classifyBscRpcEndpoints() (env-configured first, then public fallbacks) before
// giving up. Callers (fetchOnchainBalance, fetchTransactionReceipt/
// fetchTransactionByHash/fetchBlockNumber) rely on this to collapse to
// QUERY_FAILED / RPC_UNAVAILABLE rather than a false PASS/verified result.

import { classifyBscRpcEndpoints } from './config';

const RPC_TIMEOUT_MS = 8000;

interface JsonRpcResponse {
  jsonrpc: string;
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

let requestId = 0;

/**
 * SECURITY (wallet-security-expert finding): `url` is intentionally NEVER
 * interpolated into a thrown error message here. Operator-configured RPC endpoints
 * (`BSC_RPC_URL` / `BSC_RPC_URL_FALLBACK`) commonly embed an API key in the URL path
 * or query string (Alchemy/QuickNode/etc convention) — and these errors flow into
 * `WithdrawalOnchainVerificationAttempt.detail` (persisted) and the
 * `POST /api/admin/withdrawals/[id]/submit-tx` JSON response (rendered in the admin
 * browser). `label` is an anonymous positional tag ("configured#1", "public#2" — see
 * jsonRpcCallWithSource below), never the URL itself. Same principle as
 * makeNiaError() in web/src/lib/nia/client.ts, which never puts the request URL in
 * an error message either.
 */
async function callOne(url: string, method: string, params: unknown[], label: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`RPC ${method} @ ${label} responded HTTP ${res.status}`);
    }
    const json = (await res.json()) as JsonRpcResponse;
    if (json.error) {
      throw new Error(`RPC ${method} @ ${label} returned error ${json.error.code}: ${json.error.message}`);
    }
    return json.result ?? null;
  } finally {
    clearTimeout(timeout);
  }
}

export interface JsonRpcCallWithSource {
  result: unknown;
  /** Anonymous label of the endpoint that answered — e.g. "configured#1",
   *  "public#2". NEVER the URL itself (see callOne's doc comment). Consumed for
   *  A-5 §2.7 audit logging (was the verdict sourced from a public fallback RPC?). */
  source: string;
}

/**
 * Calls `method` against each classifyBscRpcEndpoints() entry in order (env-configured
 * endpoints first, then public fallbacks), returning the first success along with an
 * anonymous label identifying which endpoint answered. Every endpoint failing
 * (network error, timeout, non-2xx, or a JSON-RPC `error` field) throws one aggregated
 * error (itself URL-free — see callOne) — this function never returns a
 * default/placeholder value, and never silently swallows a failure into e.g. "0".
 * Callers must let this propagate (or map it to QUERY_FAILED / RPC_UNAVAILABLE),
 * never catch-and-substitute-zero.
 */
export async function jsonRpcCallWithSource(method: string, params: unknown[] = []): Promise<JsonRpcCallWithSource> {
  const endpoints = classifyBscRpcEndpoints();
  if (endpoints.length === 0) {
    // Not reachable today (PUBLIC_BSC_RPC_ENDPOINTS is always non-empty) — defensive
    // only, matching isOnchainVerifyConfigured()'s comment in config.ts.
    throw new Error('No BSC RPC endpoint available (classifyBscRpcEndpoints() returned an empty list).');
  }

  const errors: string[] = [];
  let configuredIdx = 0;
  let publicIdx = 0;
  for (const { url, kind } of endpoints) {
    const label = kind === 'configured' ? `configured#${++configuredIdx}` : `public#${++publicIdx}`;
    try {
      const result = await callOne(url, method, params, label);
      return { result, source: label };
    } catch (e) {
      errors.push(`${label}: ${(e as Error).message}`);
    }
  }
  throw new Error(`All BSC RPC endpoints failed for ${method}: ${errors.join(' | ')}`);
}

/**
 * Convenience wrapper over jsonRpcCallWithSource() for callers that don't need to
 * know which endpoint answered (e.g. localLedger.ts's fetchOnchainBalance). See
 * jsonRpcCallWithSource for the full failure contract.
 */
export async function jsonRpcCall(method: string, params: unknown[] = []): Promise<unknown> {
  return (await jsonRpcCallWithSource(method, params)).result;
}
