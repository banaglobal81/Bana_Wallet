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
  // Referral tree (Phase A)
  referralCode: string | null;
  invitedBy: string | null;
  referralCount: number;
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

// A-5 (V2-CORE, rev03 W-3) — AWAITING_ONCHAIN is the LOCAL-authority rail's
// post-approval, pre-settlement state (see web/src/lib/withdrawalOnchain.ts).
export type WithdrawalStatus = 'PENDING' | 'PROCESSING' | 'AWAITING_ONCHAIN' | 'APPROVED' | 'REJECTED' | 'FAILED';

export type WithdrawalAuthority = 'HUB' | 'LOCAL';

export interface WithdrawalOnchainVerificationAttempt {
  id: string;
  submittedTxHash: string;
  result: string; // 'PASS' | OnchainVerifyFailureReason — rendered verbatim (A-7 ADM-20)
  detail: string | null;
  confirmationsAtCheck: number | null;
  checkedByAdminId: string;
  checkedAt: string;
}

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
  // A-5/A-7 (V2-CORE, rev04 N-4) — fee fields. Both nullable: null = "not yet
  // computed by any code path" (never "fee confirmed zero" — A-3 principle 5).
  feeAmount: string | null;
  debitTotal: string | null;
  // A-5 (V2-CORE) — LOCAL rail fields.
  balanceAuthorityAtRequest: WithdrawalAuthority;
  localHoldId: string | null;
  onchainChainId: number | null;
  onchainTxHash: string | null;
  onchainVerifiedAt: string | null;
  onchainVerificationAttempts?: WithdrawalOnchainVerificationAttempt[];
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

/**
 * Approve a pending withdrawal. HUB rail: forwards it to the hub (funds leave
 * now). LOCAL rail: only moves the request to AWAITING_ONCHAIN — no funds
 * move here (A-5 §1.5); the admin still has to execute the on-chain transfer
 * outside this app and call submitWithdrawalTx() with the resulting hash.
 */
export async function approveWithdrawal(id: string): Promise<{ status: WithdrawalStatus }> {
  const r = await postJson<{ ok: boolean; data?: { status: WithdrawalStatus } }>(
    `/api/admin/withdrawals/${id}/approve`,
    {},
  );
  return { status: r.data?.status ?? 'APPROVED' };
}

/** Reject a pending withdrawal — no hub call. */
export async function rejectWithdrawal(id: string, reason?: string): Promise<void> {
  await postJson(`/api/admin/withdrawals/${id}/reject`, { reason });
}

export type SubmitWithdrawalTxResult =
  | { ok: true }
  | { ok: false; error: string; reason: string };

/**
 * A-5 §1.5 steps 1-10 (LOCAL rail only). Submits an admin-observed txHash for
 * read-only on-chain verification (verifyOnchainWithdrawal). Deliberately
 * does NOT throw on a verification failure/uncertain outcome (W-5 — the
 * request status stays AWAITING_ONCHAIN; the caller renders the 3-way
 * outcome — pass / fail / inconclusive — from the returned reason).
 */
export async function submitWithdrawalTx(id: string, txHash: string): Promise<SubmitWithdrawalTxResult> {
  const res = await fetch(`/api/admin/withdrawals/${id}/submit-tx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ txHash }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok && res.status >= 500) {
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  if (body?.ok === true) return { ok: true };
  return { ok: false, error: body?.error ?? 'Verification failed.', reason: body?.reason ?? 'UNKNOWN' };
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
  stakingWorkerEnabled: boolean;
  stakingWorkerMode: 'INTERVAL' | 'DAILY';
  stakingWorkerIntervalMinutes: number;
  stakingWorkerDailyTime: string;
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
  // Count of ACTIVE positions on this product with autoRenew = true — drives the
  // rate-lowering warning (staking-auto-renew-ruling.md R-1). Read-only, informational.
  autoRenewActiveCount: number;
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
  // admin-staking-debt-visibility-frd.md §4.4 P-5 — derived server-side from
  // grantedByAdminId on the admin positions route only. Deliberately absent
  // from serializePosition / the user-facing /api/staking/positions response
  // (A6 — admin identity stays out of the user API surface).
  isGrant: boolean;
}

// admin-staking-debt-visibility-frd.md §3.1. `totalPaid` is REMOVED — do not
// reintroduce it, aliased or otherwise (see stats/route.ts header comment).
export interface AdminStakingStat {
  coin: string;

  // Sec 1: user funds. Not a platform liability (grants excepted, see below).
  activePrincipal: string;          // SUM(principal) WHERE status='ACTIVE'
  grantedActivePrincipal: string;   // subset of activePrincipal — WHERE grantedByAdminId IS NOT NULL. Never sum with activePrincipal.

  // Sec 2: liability. Interest that exists only in this ledger.
  ledgeredInterest: string;         // SUM(paidInterest) — all statuses (A10: includes renewed-then-MATURED predecessors)
  hubSettled: string;               // structural constant "0" — see stats/route.ts DS-1
  unpaidInterest: string;           // ledgeredInterest − hubSettled, computed server-side
  hubSettledStatus: 'NO_RAIL';      // discriminator the UI keys copy off of, not the raw "0"

  // Sec 3: rate of increase.
  dailyAccrualRate: string;         // SUM(principal × dailyRatePct / 100) WHERE status='ACTIVE'

  activeCount: number;
  maturedCount: number;
  totalCount: number;

  // INV-1 watchdog — expected 0. Non-zero means "Actually sent to wallets = 0"
  // is no longer trustworthy; the UI must show an incident banner (§3.4/§5.5).
  settledStatusCount: number;
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

/**
 * ADMIN: grant a staking position to a user by email (bonus/promotion).
 * No hub balance required — BANA is the platform's own token. Audit-logged.
 */
export async function grantStakePosition(input: {
  email: string; productId: string; amount: string;
}): Promise<{ id: string }> {
  const res = await fetch('/api/admin/staking/positions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) throw new Error(body?.error || `Request failed (${res.status})`);
  return body.data;
}

export async function listStakingPositions(): Promise<AdminStakePosition[]> {
  const r = await getJson<{ ok: boolean; data: AdminStakePosition[] }>('/api/admin/staking/positions');
  return Array.isArray(r.data) ? r.data : [];
}

/**
 * Per-coin staking liability overview — active principal, unpaid (ledger-only)
 * interest, and the structural hub-settled zero. Throws on failure; callers
 * MUST distinguish "failed to load" from "loaded, zero liability" (A8 — do
 * NOT `.catch(() => [])` this, admin-staking-debt-visibility-frd.md §5.4 E-1).
 */
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

// ---- Referral commissions ----

export interface ReferralEarner {
  email: string;
  days: number;
  total: string;
  matching: string;
  boost: string;
}

export interface ReferralOverview {
  enabled: boolean;
  grandTotal: string;
  uplines: number;
  earners: ReferralEarner[];
}

/** Referral commission overview (total paid + top earners). */
export async function getReferralOverview(): Promise<ReferralOverview> {
  const r = await getJson<{ ok: boolean; data: ReferralOverview }>('/api/admin/referral');
  return r.data;
}

// ---- Managed coins (custom EVM tokens) ----

export interface CoinNetwork {
  code: string;
  contractAddress: string;
  decimals: number;
  depositEnabled?: boolean;
  withdrawEnabled?: boolean;
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

// ---- V2-CORE — PoR-1″ reserve dashboard (/admin/reserve) ----
// docs/specs/staking-yield-system-v2-design-a8-admin-dashboard-frd.md §5.
// A `Section<T>` mirrors the server's discriminated union (DC-1) — a fetch
// failure on ONE section must never be silently rendered as a zero/empty value
// (E-2′/E-3′). Components must switch on `.status` before reading anything else.

export type AdminSection<T> = ({ status: 'OK' } & T) | { status: 'UNAVAILABLE'; reason: string };

export type PorResult = 'PASS' | 'FAIL' | 'INCOMPLETE' | 'QUERY_FAILED' | 'NO_RESERVE_BASIS';
export type PorComponentRole = 'ADDITIVE' | 'SUBSET_OF_LOCAL_BALANCE' | 'PROGRAM_COMMITMENT' | 'TIMING_ADJUSTMENT';

export interface PorComponent {
  key: string;
  amount: string | null;
  role: PorComponentRole;
  blockedBy: 'H2_UNDECIDED' | null;
}

export interface ReserveSection {
  latestRun: {
    id: string;
    ranAt: string;
    trigger: string;
    result: PorResult;
    leftTotal: string | null;
    rightTotal: string;
    marginAmount: string | null;
    breachDetail: string | null;
    blocksIssuance: boolean;
    controlledAddressCount: number;
    components: PorComponent[];
  } | null;
  workerEnabled: boolean;
  intervalMinutes: number;
  staleAfterMinutes: number;
  isStale: boolean;
  consecutiveQueryFailedCount: number;
  activeControlledAddressCount: number;
  inFlightOnchainWithdrawalTotal: string | null;
}

export interface LiabilitySection {
  leftTotal: string | null;
  components: PorComponent[];
  dailyAccrualRate: string | null;
  onchainSettledTotal: string;
  withdrawalRailStatus: 'NO_RAIL' | 'MANUAL_ONCHAIN';
  claimRailStatus: 'DISABLED' | 'ENABLED';
}

export interface LocalLedgerSection {
  balanceTotal: string;
  heldTotal: string;
  availableTotal: string;
  heldByReason: { reasonCode: 'WITHDRAWAL_PENDING' | 'STAKE_PRINCIPAL_LOCK'; amount: string; count: number }[];
  nonZeroBalanceUserCount: number;
  ledgerEntryCount: number;
  reconciliation: { lastRunAt: string | null; checkedCount: number | null; mismatchCount: number | null; versionDriftCount: number | null };
  holdInvariant: { holdsTotal: string; openWithdrawalRequestTotal: string; matches: boolean };
}

export interface IssuanceGateSection {
  blockers: Array<{ code: string; runId?: string; state?: string }>;
  settlementWorkerEnabled: boolean;
  claimEnabled: boolean;
}

export interface AuthorityWatchSection {
  authority: 'HUB' | 'LOCAL';
  alertStage: 'CLEAR' | 'T1_WARNING' | 'T2_HALTED';
  alertSince: string | null;
  lastProbeAt: string | null;
  lastProbeResult: string | null;
  consecutiveUnknownCount: number;
  probeWorkerEnabled: boolean;
  probeIsStale: boolean;
  hubListed: boolean;
  t2Evidence: { userId: string; amount: string; probedAt: string } | null;
  activeTransition: { id: string; direction: string; status: string; startedAt: string } | null;
  unknownEscalationThreshold: number;
}

export interface AdminSolvencyCoin {
  coin: string;
  authority: 'HUB' | 'LOCAL';
  reserve: AdminSection<ReserveSection>;
  liability: AdminSection<LiabilitySection>;
  localLedger: AdminSection<LocalLedgerSection>;
  issuanceGate: AdminSection<IssuanceGateSection>;
  authorityWatch: AdminSection<AuthorityWatchSection>;
}

export interface SolvencyIncident {
  code: string;
  coin: string;
  [key: string]: unknown;
}

export interface AdminSolvencyData {
  coins: AdminSolvencyCoin[];
  incidents: SolvencyIncident[];
  warnings: SolvencyIncident[];
}

export async function getSolvency(): Promise<AdminSolvencyData> {
  const r = await getJson<{ ok: boolean; data: AdminSolvencyData }>('/api/admin/solvency');
  return r.data ?? { coins: [], incidents: [], warnings: [] };
}

/** HI-4 — manual, read-only PoR-1″ re-check for one coin. 30s per-coin cooldown server-side. */
export async function runReserveVerificationNow(coin: string): Promise<{ id: string; result: PorResult }> {
  const r = await postJson<{ ok: boolean; data: { id: string; result: PorResult } }>('/api/admin/reserve/verify', { coin });
  return r.data;
}

// ---- PlatformControlledAddress registry (§6.4 — PoR-1″'s right-hand side) ----

export interface PlatformControlledAddress {
  id: string;
  coin: string;
  network: string;
  address: string;
  label: string;
  addedByEmail: string;
  active: boolean;
  addedAt: string;
  removedAt: string | null;
  notes: string | null;
}

export async function listControlledAddresses(): Promise<PlatformControlledAddress[]> {
  const r = await getJson<{ ok: boolean; data: PlatformControlledAddress[] }>('/api/admin/reserve/addresses');
  return Array.isArray(r.data) ? r.data : [];
}

export async function addControlledAddress(input: {
  coin: string;
  network: string;
  address: string;
  label: string;
  notes?: string;
}): Promise<void> {
  await postJson('/api/admin/reserve/addresses', input);
}

/** RG-4 — soft delete only. */
export async function deactivateControlledAddress(id: string): Promise<void> {
  const res = await fetch(`/api/admin/reserve/addresses/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ active: false }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) throw new Error(body?.error || `Request failed (${res.status})`);
}
