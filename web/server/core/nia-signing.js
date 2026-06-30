// server/core/nia-signing.js — pure logic (primary harness target)
//
// The HMAC signing / normalization logic from server.js, extracted with no side
// effects. No real dependencies (fetch/express) — only crypto (deterministic:
// the signature depends solely on its inputs).
//
// WHY: signature mismatches are BANA's most common failure cause. Isolating the
// sign-string building and query normalization as pure functions lets us pin
// them down deterministically in tests/harness.

import crypto from 'node:crypto';

/**
 * Normalize a Nia-Hub query: drop undefined/null/'' values.
 * (If URLSearchParams emits "symbol=undefined", the signature canonicalization breaks.)
 * @param {Record<string, unknown>} [query]
 * @returns {Record<string, string>}
 */
export function cleanQuery(query) {
  const clean = {};
  if (!query) return clean;
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') clean[k] = String(v);
  }
  return clean;
}

/**
 * Query object → normalized query string (no leading '?').
 * @param {Record<string, unknown>} [query]
 * @returns {string} e.g. "a=1&b=2" or ""
 */
export function queryString(query) {
  return new URLSearchParams(cleanQuery(query)).toString();
}

/**
 * Trading scheme payload: plain concatenation of timestamp + nonce + METHOD + path + bodyOrQuery.
 * Used only by buildTradingHeaders / the X-Nia-* scheme.
 * @param {{timestamp: string, nonce: string, method: string, path: string, signedPart: string}} p
 * @returns {string}
 */
export function buildSignPayload({ timestamp, nonce, method, path, signedPart }) {
  return `${timestamp}${nonce}${method}${path}${signedPart}`;
}

/**
 * Wallet/Settlement scheme payload (X-Api-Key scheme).
 * Payload = PLAIN concatenation: timestamp + nonce + METHOD + /full/path?query + body
 * (NO separators between fields.)
 *
 * LIVE-VERIFIED: The official Nia-Hub docs show '\n' separators, but the live
 * api.niawallet.com API verifies plain concatenation — GET /api/v1/wallets returned
 * HTTP 200 with plain-concat and HTTP 401 "Invalid Signature" with newline-joined.
 * Do NOT change this back to [].join('\n') — the docs are misleading.
 *
 * nonce = UUID v4; timestamp tolerance ±60s.
 * @param {{timestamp: string, nonce: string, method: string, fullPath: string, bodyStr: string}} p
 * @returns {string}
 */
export function buildWalletSignPayload({ timestamp, nonce, method, fullPath, bodyStr }) {
  return `${timestamp}${nonce}${method}${fullPath}${bodyStr}`;
}

/**
 * HMAC-SHA256 hex signature.
 * @param {string} secret
 * @param {string} payload
 * @returns {string} hex
 */
export function hmacHex(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Build Trading API headers (X-Nia-* scheme).
 * `path` is the query-less path; `signedPart` is the bodyString or "?query".
 */
export function buildTradingHeaders({ apiKey, secret, method, path, signedPart, timestamp, nonce, tenantId }) {
  const payload = buildSignPayload({ timestamp, nonce, method, path, signedPart });
  const headers = {
    'X-Nia-Tenant-Key': apiKey,
    'X-Nia-Signature': hmacHex(secret, payload),
    'X-Nia-Timestamp': timestamp,
    'X-Nia-Nonce': nonce,
    'Content-Type': 'application/json',
  };
  if (tenantId) headers['X-Nia-Tenant-Id'] = tenantId;
  return headers;
}

/**
 * Build Wallet/Settlement API headers (X-Api-Key scheme).
 * `fullPath` is the full path including query; `bodyStr` is the body string ('' for GET).
 */
export function buildWalletHeaders({ apiKey, secret, method, fullPath, bodyStr, timestamp, nonce }) {
  const payload = buildWalletSignPayload({ timestamp, nonce, method, fullPath, bodyStr });
  return {
    'X-Api-Key': apiKey,
    'X-Timestamp': timestamp,
    'X-Nonce': nonce,
    'X-Signature': hmacHex(secret, payload),
    'Content-Type': 'application/json',
  };
}

/**
 * Unwrap a Nia envelope ({success|ok, data}) to the bare data.
 * @param {any} data
 * @returns {any}
 */
export function unwrapEnvelope(data) {
  if (data && typeof data === 'object' && 'data' in data && ('success' in data || 'ok' in data)) {
    return data.data;
  }
  return data;
}
