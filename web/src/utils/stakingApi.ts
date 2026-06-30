// Frontend client for user-facing staking endpoints. All routes are session-guarded
// server-side (requireUser); identity is derived from the session, never the client.

export interface StakingProduct {
  id: string;
  coin: string;
  name: string;
  termDays: number;
  dailyRatePct: string;
  aprPct: string;
  minAmount: string | null;
  maxAmount: string | null;
  capacity: string | null;
  remaining: string | null;
  full: boolean;
}

export type StakeStatus = 'ACTIVE' | 'MATURED' | 'PAID';

export interface StakePosition {
  id: string;
  productId: string;
  productName: string;
  coin: string;
  principal: string;
  dailyRatePct: string;
  aprPct: string;
  termDays: number;
  startAt: string;
  maturityAt: string;
  status: StakeStatus;
  accruedInterest: string;
  fullInterest: string;
  projectedTotal: string;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

/** Open staking products available to stake into. */
export async function getStakingProducts(): Promise<StakingProduct[]> {
  const r = await getJson<{ ok: boolean; data: StakingProduct[] }>('/api/staking/products');
  return Array.isArray(r.data) ? r.data : [];
}

/** The signed-in user's stake positions (with live-computed accrual). */
export async function getStakePositions(): Promise<StakePosition[]> {
  const r = await getJson<{ ok: boolean; data: StakePosition[] }>('/api/staking/positions');
  return Array.isArray(r.data) ? r.data : [];
}

/** Lock funds into a staking product. Throws with the server message on failure. */
export async function stake(productId: string, amount: string): Promise<{ id: string; maturityAt: string }> {
  const res = await fetch('/api/staking/stake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ productId, amount }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) throw new Error(body?.error || `Request failed (${res.status})`);
  return body.data;
}
