// Frontend client for the BANA backend (which proxies Nia-Hub securely).
// The browser only ever talks to our own /api/nia/* routes — never Nia directly,
// and never sees the API secret.

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

/** Trade & fee receipts for a user (history). */
export async function getNiaTrades(userId?: string): Promise<any[]> {
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  const r = await getJson<{ ok: boolean; data: any[] }>(`/api/nia/trades${qs}`);
  return Array.isArray(r.data) ? r.data : [];
}

/** Open & filled orders for a user (history). */
export async function getNiaOrders(userId?: string): Promise<any[]> {
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  const r = await getJson<{ ok: boolean; data: any[] }>(`/api/nia/orders${qs}`);
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

/** Wallet balances for a user (SPOT / FUTURES / INSURANCE / BONUS). */
export async function getNiaBalance(userId?: string): Promise<any> {
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  const r = await getJson<{ ok: boolean; data: any }>(`/api/nia/balance${qs}`);
  return r.data;
}

/** Deposit history (returns the items array). */
export async function getNiaDeposits(userId?: string): Promise<any[]> {
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  const r = await getJson<{ ok: boolean; data: any }>(`/api/nia/deposits${qs}`);
  return r.data?.items ?? (Array.isArray(r.data) ? r.data : []);
}

/** Withdrawal history (returns the items array). */
export async function getNiaWithdrawals(userId?: string): Promise<any[]> {
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  const r = await getJson<{ ok: boolean; data: any }>(`/api/nia/withdrawals${qs}`);
  return r.data?.items ?? (Array.isArray(r.data) ? r.data : []);
}

export interface WithdrawalRequest {
  currency: string;
  network: string;
  amount: string;
  toAddress: string;
  userId?: string;
}

/** Submit a real withdrawal request. */
export async function requestNiaWithdrawal(req: WithdrawalRequest): Promise<any> {
  const r = await postJson<{ ok: boolean; data: any }>('/api/nia/withdrawals', req);
  return r.data;
}

// ---- Settlement (Broker / Admin) ----

/** Unsettled commission for the broker (no userId — keyed by API key). */
export async function getNiaUnsettled(): Promise<any> {
  const r = await getJson<{ ok: boolean; data: any }>('/api/nia/settlement/unsettled');
  return r.data;
}

/** Broker settlement history. */
export async function getNiaSettlementHistory(): Promise<any[]> {
  const r = await getJson<{ ok: boolean; data: any }>('/api/nia/settlement/history');
  return r.data?.history ?? r.data?.data ?? (Array.isArray(r.data) ? r.data : []);
}
