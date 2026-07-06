// Frontend client for admin-only endpoints. All routes are ADMIN-gated server-side
// (requireAdmin); identity is derived from the session, never the client.

export interface AdminUser {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN';
  niaUserId: string | null;
  createdAt: string;
  disabled: boolean;
  authMethod: 'password' | 'google';
  resetPending: boolean;
}

export interface AdminUserWallet {
  email: string;
  niaUserId: string | null;
  balance: unknown;
  deposits: any[];
  withdrawals: any[];
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

/** List users (optionally filtered by email substring). */
export async function listUsers(q?: string): Promise<AdminUser[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : '';
  const r = await getJson<{ ok: boolean; data: AdminUser[] }>(`/api/admin/users${qs}`);
  return Array.isArray(r.data) ? r.data : [];
}

/** Change a user's role. Throws with the server message on failure (e.g. last-admin guard). */
export async function setUserRole(userId: string, role: 'USER' | 'ADMIN'): Promise<void> {
  await postJson('/api/admin/users/role', { userId, role });
}

/** Generate a one-time password-reset link for a user. */
export async function createUserResetLink(userId: string): Promise<{ link: string; expiresInMinutes: number }> {
  const r = await postJson<{ ok: boolean; data: { link: string; expiresInMinutes: number } }>(
    '/api/admin/users/reset-link',
    { userId },
  );
  return r.data;
}

/** Lock or unlock a user account (disabled users can't sign in). */
export async function setUserDisabled(userId: string, disabled: boolean): Promise<void> {
  await postJson('/api/admin/users/disable', { userId, disabled });
}

/** Fetch a user's live balances + recent deposits/withdrawals from the hub. */
export async function getUserWallet(userId: string): Promise<AdminUserWallet> {
  const r = await getJson<{ ok: boolean; data: AdminUserWallet }>(`/api/admin/users/${userId}/wallet`);
  return r.data;
}

// ---- Withdrawal approval queue ----

export type WithdrawalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'FAILED';

export interface WithdrawalRequest {
  id: string;
  email: string;
  niaUserId: string;
  currency: string;
  network: string;
  amount: string;
  toAddress: string;
  status: WithdrawalStatus;
  reviewedAt: string | null;
  rejectionReason: string | null;
  hubTxId: string | null;
  lastError: string | null;
  createdAt: string;
}

/** List the withdrawal queue (+ pending count). Optional status filter. */
export async function listWithdrawals(
  status?: WithdrawalStatus,
): Promise<{ items: WithdrawalRequest[]; pendingCount: number }> {
  const qs = status ? `?status=${status}` : '';
  const r = await getJson<{ ok: boolean; data: { items: WithdrawalRequest[]; pendingCount: number } }>(
    `/api/admin/withdrawals${qs}`,
  );
  return { items: r.data?.items ?? [], pendingCount: r.data?.pendingCount ?? 0 };
}

/** Approve a pending withdrawal — forwards it to the hub (funds leave). */
export async function approveWithdrawal(id: string): Promise<void> {
  await postJson(`/api/admin/withdrawals/${id}/approve`, {});
}

/** Reject a pending withdrawal — no hub call. */
export async function rejectWithdrawal(id: string, reason?: string): Promise<void> {
  await postJson(`/api/admin/withdrawals/${id}/reject`, { reason });
}

// ---- Dashboard KPIs + audit log ----

export interface AdminStats {
  users: { total: number; admins: number; disabled: number; new7d: number };
  withdrawals: { pending: number; approved: number; rejected: number; failed: number };
}

export interface AuditEntry {
  id: string;
  adminEmail: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: string | null;
  createdAt: string;
}

/** Broker dashboard KPIs. */
export async function getAdminStats(): Promise<AdminStats> {
  const r = await getJson<{ ok: boolean; data: AdminStats }>('/api/admin/stats');
  return r.data;
}

/** Recent admin-action audit log. */
export async function getAuditLog(limit = 50): Promise<AuditEntry[]> {
  const r = await getJson<{ ok: boolean; data: AuditEntry[] }>(`/api/admin/audit?limit=${limit}`);
  return Array.isArray(r.data) ? r.data : [];
}

export interface DepositFeedItem {
  id: number;
  ts: number;
  userId: string | null;
  amount: string | null;
  currency: string | null;
  network: string | null;
  status: string | null;
}

/** Recent platform deposits (best-effort, from webhook events). */
export async function getRecentDeposits(): Promise<DepositFeedItem[]> {
  try {
    const r = await getJson<{ ok: boolean; data: DepositFeedItem[] }>('/api/admin/deposits-feed');
    return Array.isArray(r.data) ? r.data : [];
  } catch {
    return [];
  }
}

// ---- Platform policy (admin settings) ----

export interface PlatformPolicy {
  whitelistOnly: boolean;
  autoApproveUnderUsd: string | null;
  maintenanceMode: boolean;
  dailyWithdrawalLimitUsd: string | null;
  signupsEnabled: boolean;
  supportEmail: string | null;
  displayName: string | null;
}

/** Read the platform withdrawal policy. */
export async function getPlatformPolicy(): Promise<PlatformPolicy> {
  const r = await getJson<{ ok: boolean; data: PlatformPolicy }>('/api/admin/settings');
  return r.data;
}

/** Update the platform withdrawal policy. Throws with the server message on failure. */
export async function setPlatformPolicy(input: Partial<PlatformPolicy>): Promise<PlatformPolicy> {
  const r = await postJson<{ ok: boolean; data: PlatformPolicy }>('/api/admin/settings', input);
  return r.data;
}

// ---- Staking ----

export type StakingProductStatus = 'OPEN' | 'CLOSED';

export interface AdminStakingProduct {
  id: string;
  coin: string;
  name: string;
  termDays: number;
  dailyRatePct: string;
  aprPct: string;
  minAmount: string | null;
  maxAmount: string | null;
  capacity: string | null;
  status: StakingProductStatus;
  createdAt: string;
  totalStaked: string;
  positionCount: number;
}

export interface AdminStakePosition {
  id: string;
  email: string;
  productName: string;
  coin: string;
  principal: string;
  aprPct: string;
  termDays: number;
  startAt: string;
  maturityAt: string;
  status: 'ACTIVE' | 'MATURED' | 'PAID';
  accruedInterest: string;
  paidInterest: string;
  daysPaid: number;
}

export interface AdminStakingStat {
  coin: string;
  activePrincipal: string;
  totalPaid: string;
  activeCount: number;
  totalCount: number;
}

export interface StakingProductInput {
  coin: string;
  name: string;
  termDays: number;
  dailyRatePct: string;
  minAmount?: string | null;
  maxAmount?: string | null;
  capacity?: string | null;
}

export async function listStakingProducts(): Promise<AdminStakingProduct[]> {
  const r = await getJson<{ ok: boolean; data: AdminStakingProduct[] }>('/api/admin/staking/products');
  return Array.isArray(r.data) ? r.data : [];
}

export async function createStakingProduct(input: StakingProductInput): Promise<void> {
  await postJson('/api/admin/staking/products', input);
}

export async function updateStakingProduct(id: string, patch: Partial<StakingProductInput> & { status?: StakingProductStatus }): Promise<void> {
  const res = await fetch(`/api/admin/staking/products/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(patch),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) throw new Error(body?.error || `Request failed (${res.status})`);
}

export async function deleteStakingProduct(id: string): Promise<void> {
  const res = await fetch(`/api/admin/staking/products/${id}`, { method: 'DELETE', headers: { Accept: 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) throw new Error(body?.error || `Request failed (${res.status})`);
}

export async function listStakingPositions(): Promise<AdminStakePosition[]> {
  const r = await getJson<{ ok: boolean; data: AdminStakePosition[] }>('/api/admin/staking/positions');
  return Array.isArray(r.data) ? r.data : [];
}

/** Per-coin staking liability overview (active principal + interest paid to date). */
export async function getStakingStats(): Promise<AdminStakingStat[]> {
  const r = await getJson<{ ok: boolean; data: AdminStakingStat[] }>('/api/admin/staking/stats');
  return Array.isArray(r.data) ? r.data : [];
}

export interface StakingRunResult {
  processed: number;
  matured: number;
  daysCredited: number;
  totalPaid: string;
  at: string;
}

/** Run the daily staking settlement now (admin-triggered; idempotent). */
export async function runStakingSettlement(): Promise<StakingRunResult> {
  const r = await postJson<{ ok: boolean; data: StakingRunResult }>('/api/admin/staking/run', {});
  return r.data;
}

export interface StakingRunStatus {
  lastPayoutAt: string | null;
  payoutsToday: number;
  totalPaidToday: string;
  activeCount: number;
}

/** Settlement status — when interest was last paid, paid today, active count. */
export async function getStakingRunStatus(): Promise<StakingRunStatus> {
  const r = await getJson<{ ok: boolean; data: StakingRunStatus }>('/api/admin/staking/run');
  return r.data;
}

// ---- Managed coins (custom EVM tokens) ----

export interface CoinNetwork {
  code: string;
  contractAddress: string;
  decimals: number;
}

export interface ManagedCoin {
  id: string;
  symbol: string;
  name: string;
  networks: CoinNetwork[];
  logoKey: string | null;
  visible: boolean;
  createdAt: string;
}

export interface ManagedCoinInput {
  symbol: string;
  name: string;
  networks: CoinNetwork[];
  logoKey?: string | null;
}

export async function listCoins(): Promise<ManagedCoin[]> {
  const r = await getJson<{ ok: boolean; data: ManagedCoin[] }>('/api/admin/coins');
  return Array.isArray(r.data) ? r.data : [];
}

export async function createCoin(input: ManagedCoinInput): Promise<void> {
  await postJson('/api/admin/coins', input);
}

export async function updateCoin(
  id: string,
  patch: { visible?: boolean; name?: string; networks?: CoinNetwork[] },
): Promise<void> {
  const res = await fetch(`/api/admin/coins/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(patch),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) throw new Error(body?.error || `Request failed (${res.status})`);
}

export async function deleteCoin(id: string): Promise<void> {
  const res = await fetch(`/api/admin/coins/${id}`, { method: 'DELETE', headers: { Accept: 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) throw new Error(body?.error || `Request failed (${res.status})`);
}

/** Upload a logo image to R2 (admin). Returns the stored object key. */
export async function uploadImage(file: File, folder = 'coin-logos'): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`/api/admin/upload?folder=${folder}`, { method: 'POST', body: fd });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) throw new Error(body?.error || `Upload failed (${res.status})`);
  return body.data.key as string;
}
