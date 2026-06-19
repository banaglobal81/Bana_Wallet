import 'server-only';

import crypto from 'node:crypto';
import {
  buildTradingHeaders,
  buildWalletHeaders,
  cleanQuery,
  queryString,
  unwrapEnvelope,
} from '../../../server/core/nia-signing.js';
import { NIA_API_KEY, NIA_API_SECRET, NIA_BASE_URL, NIA_BROKER_ID, NIA_HUB_URL, isConfigured } from './config';

// ---------------------------------------------------------------------------
// Error type: attaches .status and .data for safe upstream error forwarding.
// ---------------------------------------------------------------------------
interface NiaError extends Error {
  status: number;
  data?: unknown;
}

function makeNiaError(message: string, status: number, data?: unknown): NiaError {
  const err = new Error(message) as NiaError;
  err.status = status;
  err.data = data;
  return err;
}

// ---------------------------------------------------------------------------
// Trading API (X-Nia-* scheme)
// ---------------------------------------------------------------------------

/**
 * Make a signed call to the Nia-Hub Trading API.
 * Signing: X-Nia-Tenant-Key / X-Nia-Signature / X-Nia-Timestamp / X-Nia-Nonce
 * Payload: timestamp + nonce + METHOD + path + (bodyString | "?queryString")
 * Nonce: 16-byte random hex
 */
export async function niaRequest(
  method: string,
  apiPath: string,
  { query, body }: { query?: Record<string, unknown>; body?: Record<string, unknown> } = {},
): Promise<unknown> {
  if (!isConfigured()) {
    throw makeNiaError('Nia-Hub API credentials are not configured on the server.', 503);
  }

  let url = `${NIA_BASE_URL}${apiPath}`;
  let signedPart = '';
  const fetchOpts: RequestInit & { headers: Record<string, string>; body?: string } = {
    method,
    headers: {},
  };

  if (method === 'GET' || method === 'DELETE') {
    const qs = queryString(query);
    // Trading scheme signs "?queryString" (with leading '?') or '' for no params.
    signedPart = qs ? `?${qs}` : '';
    if (qs) url += `?${qs}`;
    if (method === 'DELETE' && body) {
      // Some DELETE calls (cancel order) take a JSON body — sign the body instead.
      signedPart = JSON.stringify(body);
      fetchOpts.body = signedPart;
    }
  } else {
    signedPart = JSON.stringify(body ?? {});
    fetchOpts.body = signedPart;
  }

  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(16).toString('hex');

  fetchOpts.headers = buildTradingHeaders({
    apiKey: NIA_API_KEY,
    secret: NIA_API_SECRET,
    method,
    path: apiPath,
    signedPart,
    timestamp,
    nonce,
    tenantId: NIA_BROKER_ID || undefined,
  }) as Record<string, string>;

  const res = await fetch(url, fetchOpts);
  const text = await res.text();
  let data: unknown;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

  if (!res.ok) {
    const d = data as Record<string, unknown> | null;
    throw makeNiaError(
      (d?.message as string) || (d?.error as string) || `Nia-Hub responded ${res.status}`,
      res.status,
      data,
    );
  }

  return unwrapEnvelope(data);
}

// ---------------------------------------------------------------------------
// Wallet / Settlement API (X-Api-Key scheme)
// ---------------------------------------------------------------------------

/**
 * Make a signed call to the Nia-Hub Wallet/Settlement API.
 * Signing: X-Api-Key / X-Timestamp / X-Nonce / X-Signature
 * Payload: PLAIN concatenation — timestamp + nonce + METHOD + /full/path?query + body
 * (NO newline separators — live-verified; docs are misleading about '\n')
 * Nonce: UUID v4
 */
export async function niaWalletRequest(
  method: string,
  apiPath: string,
  { query, body }: { query?: Record<string, unknown>; body?: Record<string, unknown> } = {},
): Promise<unknown> {
  if (!isConfigured()) {
    throw makeNiaError('Nia-Hub API credentials are not configured on the server.', 503);
  }

  const qs = queryString(query);
  const fullPath = apiPath + (qs ? `?${qs}` : '');
  const bodyStr = method === 'GET' ? '' : JSON.stringify(body ?? {});

  const timestamp = Date.now().toString();
  const nonce = crypto.randomUUID();

  const headers = buildWalletHeaders({
    apiKey: NIA_API_KEY,
    secret: NIA_API_SECRET,
    method,
    fullPath,
    bodyStr,
    timestamp,
    nonce,
  }) as Record<string, string>;

  const fetchOpts: RequestInit & { headers: Record<string, string>; body?: string } = {
    method,
    headers,
  };
  if (method !== 'GET') fetchOpts.body = bodyStr;

  const res = await fetch(`${NIA_BASE_URL}${fullPath}`, fetchOpts);
  const text = await res.text();
  let data: unknown;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

  const d = data as Record<string, unknown> | null;

  if (!res.ok || d?.success === false) {
    throw makeNiaError(
      (d?.message as string) || (d?.error as string) || `Nia-Hub responded ${res.status}`,
      res.status,
      data,
    );
  }

  return unwrapEnvelope(data);
}

// ---------------------------------------------------------------------------
// Bearer-token API (S2S — no HMAC)
// ---------------------------------------------------------------------------

/**
 * Make an S2S Bearer-token call to the Nia-Hub (e.g. address/create-smart-wallet).
 * Auth: Authorization: Bearer <NIA_API_KEY> — NOT HMAC.
 * Host: NIA_HUB_URL (falls back to NIA_BASE_URL).
 * The HMAC secret is never used or exposed here.
 */
export async function niaBearerRequest(
  method: string,
  apiPath: string,
  { body }: { body?: Record<string, unknown> } = {},
): Promise<unknown> {
  if (!NIA_API_KEY) {
    throw makeNiaError('Nia-Hub API key is not configured on the server.', 503);
  }

  const fetchOpts: RequestInit & { headers: Record<string, string>; body?: string } = {
    method,
    headers: {
      Authorization: `Bearer ${NIA_API_KEY}`,
      'Content-Type': 'application/json',
    },
  };
  if (method !== 'GET') fetchOpts.body = JSON.stringify(body ?? {});

  const res = await fetch(`${NIA_HUB_URL}${apiPath}`, fetchOpts);
  const text = await res.text();
  let data: unknown;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

  const d = data as Record<string, unknown> | null;

  if (!res.ok || d?.success === false) {
    throw makeNiaError(
      (d?.message as string) || (d?.error as string) || `Nia-Hub responded ${res.status}`,
      res.status,
      data,
    );
  }

  return unwrapEnvelope(data);
}

// ---------------------------------------------------------------------------
// Unsigned klines fetch (public endpoint — no HMAC required)
// ---------------------------------------------------------------------------

export async function niaKlinesFetch(params: {
  symbol: string;
  interval: string;
  limit?: string;
  endTime?: string;
}): Promise<unknown> {
  const clean = cleanQuery(params);
  const qs = new URLSearchParams(clean).toString();
  const url = `${NIA_BASE_URL}/api/v1/klines${qs ? `?${qs}` : ''}`;

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  let data: unknown;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

  if (!res.ok) {
    const d = data as Record<string, unknown> | null;
    throw makeNiaError(
      (d?.message as string) || (d?.error as string) || `Nia-Hub klines responded ${res.status}`,
      res.status,
      data,
    );
  }

  // Unwrap {success, data} envelope if present — return the candle array directly.
  const d = data as Record<string, unknown> | null;
  if (d && typeof d === 'object' && 'data' in d) return d.data;
  return data;
}
