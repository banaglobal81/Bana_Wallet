// Frontend client for the BANA backend (which proxies Nia-Hub securely).
// The browser only ever talks to our own /api/nia/* routes — never Nia directly,
// and never sees the API secret.

import Decimal from 'decimal.js';

export interface NiaStatus {
  ok: boolean;
  configured: boolean;
  baseUrl: string;
  brokerId: string | null;
  keyPreview: string | null;
  hasDefaultUser: boolean;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) {
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  return body as T;
}

/** Backend + Nia connection status (safe — no secret). */
export function getNiaStatus(): Promise<NiaStatus> {
  return getJson<NiaStatus>('/api/nia/status');
}

/** Trade & fee receipts for the current session user (history). */
export async function getNiaTrades(): Promise<any[]> {
  const r = await getJson<{ ok: boolean; data: any[] }>('/api/nia/trades');
  return Array.isArray(r.data) ? r.data : [];
}

/** Open & filled orders for the current session user (history). */
export async function getNiaOrders(): Promise<any[]> {
  const r = await getJson<{ ok: boolean; data: any[] }>('/api/nia/orders');
  return Array.isArray(r.data) ? r.data : [];
}

/** Supported currencies / markets (incl. deposit/withdraw config). */
export async function getNiaMarkets(): Promise<any> {
  const r = await getJson<{ ok: boolean; data: any }>('/api/nia/markets');
  return r.data;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

// ---- Wallet & Assets ----

export interface NiaWalletBalance { walletType: string; currency: string; balance: string; locked: string }

/** Wallet balances for the current session user (SPOT / FUTURES / INSURANCE / BONUS). */
export async function getNiaBalance(): Promise<any> {
  const r = await getJson<{ ok: boolean; data: any }>('/api/nia/balance');
  return r.data;
}

/** Deposit history for the current session user (returns the items array). */
export async function getNiaDeposits(): Promise<any[]> {
  const r = await getJson<{ ok: boolean; data: any }>('/api/nia/deposits');
  return r.data?.items ?? (Array.isArray(r.data) ? r.data : []);
}

/** Withdrawal history for the current session user (returns the items array). */
export async function getNiaWithdrawals(): Promise<any[]> {
  const r = await getJson<{ ok: boolean; data: any }>('/api/nia/withdrawals');
  return r.data?.items ?? (Array.isArray(r.data) ? r.data : []);
}

export interface WithdrawalRequest {
  currency: string;
  network: string;
  amount: string;
  toAddress: string;
}

/** Submit a real withdrawal request. */
export async function requestNiaWithdrawal(req: WithdrawalRequest): Promise<any> {
  const r = await postJson<{ ok: boolean; data: any }>('/api/nia/withdrawals', req);
  return r.data;
}

// ---- Settlement (Broker / Admin) ----

/** Unsettled commission for the broker (no userId — keyed by API key). */
export async function getNiaUnsettled(): Promise<any> {
  const r = await getJson<{ ok: boolean; data: any }>('/api/admin/settlement/unsettled');
  return r.data;
}

/** Broker settlement history. */
export async function getNiaSettlementHistory(): Promise<any[]> {
  const r = await getJson<{ ok: boolean; data: any }>('/api/admin/settlement/history');
  return r.data?.history ?? r.data?.data ?? (Array.isArray(r.data) ? r.data : []);
}

// ---- Notifications (in-memory webhook event ring buffer) ----

/**
 * Fetch stored webhook events from the ring buffer (newest first).
 *
 * @param userId  Optional — if provided, returns only broadcast events (userId null)
 *                plus events belonging to that user. Omit to return all events.
 * @param limit   Max events to return (default 50). Server caps at WEBHOOK_EVENTS_MAX.
 * @returns       Array of event objects, or [] on unexpected shape / error.
 */
export async function getNiaNotifications(userId?: string, limit?: number): Promise<any[]> {
  try {
    const params = new URLSearchParams();
    if (userId !== undefined) params.set('userId', userId);
    if (limit !== undefined) params.set('limit', String(limit));
    const qs = params.toString();
    const r = await getJson<{ ok: boolean; data: any[] }>(
      `/api/nia/notifications${qs ? `?${qs}` : ''}`,
    );
    return Array.isArray(r.data) ? r.data : [];
  } catch {
    return [];
  }
}

// ---- Price / K-line data (public endpoint, no auth) ----

/**
 * Fetch raw K-line (candlestick) data from Nia-Hub via the proxy.
 *
 * @param symbol   Already-prefixed symbol, e.g. "SPOT:BTC_USDT".
 *                 The caller owns the prefix — confirm "SPOT:" vs no-prefix with
 *                 Nia-Hub docs before deploying to production.
 * @param interval One of: 1m | 5m | 15m | 1h | 4h | 1d
 * @param limit    Number of candles to return (optional, server default applies).
 * @returns        Array of candle tuples [openTime, open, high, low, close, volume]
 *                 (live API shape — NOT the object shape in the docs), or [] on error.
 */
export async function getNiaKlines(
  symbol: string,
  interval: string,
  limit?: number,
): Promise<any[]> {
  try {
    const params = new URLSearchParams({ symbol, interval });
    if (limit !== undefined) params.set('limit', String(limit));
    const r = await getJson<{ ok: boolean; data: any }>(`/api/nia/klines?${params.toString()}`);
    return Array.isArray(r.data) ? r.data : [];
  } catch {
    return [];
  }
}

/**
 * Convenience wrapper: fetch the latest price and 24 h change % for a symbol.
 *
 * Fetches a single 1d candle and derives:
 *   price      = candle.close  (string, as returned by Nia-Hub)
 *   changePct  = (close - open) / open * 100  — computed with decimal.js (never Number/parseFloat)
 *
 * @param symbol  Already-prefixed symbol, e.g. "SPOT:BTC_USDT".
 * @returns       { price: string; changePct: string } or null if no candle / on error.
 */
export async function getNiaPrice(
  symbol: string,
): Promise<{ price: string; changePct: string } | null> {
  try {
    const candles = await getNiaKlines(symbol, '1d', 1);
    if (!candles.length) return null;

    const candle = candles[candles.length - 1]; // latest candle
    // Nia-Hub's live klines return ARRAY tuples [openTime, open, high, low, close, volume],
    // not the object shape shown in the docs. Read by index, with an object fallback.
    const open = Array.isArray(candle) ? candle[1] : candle?.open;
    const close = Array.isArray(candle) ? candle[4] : candle?.close;
    if (open == null || close == null) return null;

    // Use decimal.js for all arithmetic — never Number() / parseFloat() for money values.
    const decOpen = new Decimal(open);
    const decClose = new Decimal(close);
    if (decOpen.isZero()) return null; // avoid division by zero

    const changePct = decClose.minus(decOpen).div(decOpen).times(100).toFixed(2);

    return { price: String(close), changePct };
  } catch {
    return null;
  }
}
