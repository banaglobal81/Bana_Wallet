// Frontend client for user-facing staking endpoints. All routes are session-guarded
// server-side (requireUser); identity is derived from the session, never the client.

export interface StakingProduct {
  id: string;
  coin: string;
  name: string;
  termDays: number;
  /** rev05 §5.2① — renamed from `dailyRatePct` (A-4 principle 3: "이름이
   *  의미를 정한다" — a band model can add a bonus on top of this later). */
  baseDailyRatePct: string;
  aprPct: string;
  minAmount: string | null;
  maxAmount: string | null;
  capacity: string | null;
  remaining: string | null;
  full: boolean;
  /** T-8 FRD DC-1 — `'LIVE' | 'MIGRATING'`, same fail-closed module the stake
   *  route's own guard reads. NOT YET served by `GET /api/staking/products`
   *  (gap flagged to web-shared-expert in the T-9 report) — optional so the
   *  client degrades to "not migrating" rather than crashing on an absent
   *  field, and starts honoring it automatically the day the server adds it. */
  stakeRail?: 'LIVE' | 'MIGRATING';
  /** T-8 FRD DC-10 (R-AR-4/CP1-10) — `'UNAVAILABLE' | 'LIVE'`, derived
   *  server-side from the `AUTO_RENEW_V2_ENABLED` code constant. Also NOT YET
   *  served today (same gap as `stakeRail`) — callers must fail CLOSED
   *  (treat a missing value as `'UNAVAILABLE'`), never open. */
  autoRenewRail?: 'UNAVAILABLE' | 'LIVE';
}

// rev05 §5.2① (DC-8) — no 'PAID' member. StakePositionV2Status is a 2-value
// enum (ACTIVE | MATURED); a matured position's principal becomes available
// again via its LocalBalanceHold being released, not a third status value.
export type StakeStatus = 'ACTIVE' | 'MATURED';

// docs/specs/staking-auto-renew-prd.md §3 — mirrors the Prisma StakeRenewalStatus enum.
export type StakeRenewalStatus =
  | 'NONE'
  | 'RENEWED'
  | 'FAILED_PRODUCT_CLOSED'
  | 'FAILED_TERM_TOO_LONG'
  | 'FAILED_CAPACITY'
  | 'FAILED_BELOW_MIN'
  | 'FAILED_ABOVE_MAX'
  | 'FAILED_RATE_LOWERED'
  | 'FAILED_TERMS_CHANGED'
  | 'FAILED_GRANTED_POSITION'
  | 'FAILED_ACCOUNT_INACTIVE'
  | 'FAILED_SYSTEM';

export interface StakePosition {
  id: string;
  productId: string;
  productName: string;
  coin: string;
  principal: string;
  /** rev05 §5.2① — renamed from `dailyRatePct` (see `StakingProduct`). */
  baseDailyRatePct: string;
  aprPct: string;
  termDays: number;
  startAt: string;
  maturityAt: string;
  status: StakeStatus;
  // rev05 §5.2① (DC-8) — `accruedInterest` (a live day-elapsed projection) is
  // DELETED, not renamed: V2 has no such concept. Only what the settlement
  // engine has actually ledgered (`ledgeredYield`, below) may ever be shown
  // as "earned" (A-4 principles 2/6, F-C fix).
  fullInterest: string;
  projectedTotal: string;
  /** Real amount credited by the V2 settlement engine (the yield ledger).
   *  Renamed from `paidInterest` — rev05 §5.2① (DC-8). "Paid" implied a
   *  wallet-balance movement that never happens while the claim rail is
   *  off; "ledgered" matches what actually occurred (recorded, not moved). */
  ledgeredYield: string;
  daysPaid: number;
  // --- Auto-renewal (docs/specs/staking-auto-renew-prd.md §4 S4) ---
  // rev05 DC-11 / staking-v2-auto-renew-cutover-ruling.md AR-4: these fields
  // are NOT removed (unlike `accruedInterest`) — they are T-20's asset and
  // AC-C21's observation point. The requirement while
  // `AUTO_RENEW_V2_ENABLED=false` is that no V2 screen *reads* them to
  // render a control, not that the API stop serializing them.
  autoRenew: boolean;
  renewalStatus: StakeRenewalStatus;
  renewedIntoPositionId: string | null;
  renewedFromPositionId: string | null;
  /** Derived server-side (cap + not-admin-granted) — the client must not
   *  re-implement this rule (copy-spec §1.1). */
  autoRenewEligible: boolean;
}

export interface StakingPayoutRow {
  id: string;
  coin: string;
  amount: string;
  dayIndex: number;
  /** Renamed from `paidAt` — rev05 §5.2① (both the DB column and this JSON
   *  field were renamed together for consistency with every other V2 rename
   *  this cutover touches; see api/staking/rewards/route.ts's own comment). */
  settledAt: string;
  positionId: string;
}

export interface StakingRewards {
  totalByCoin: Record<string, string>;
  /** The returned page of payouts. Order depends on which query mode was used —
   *  see `getStakingRewards` / `getStakingRewardsSince` / `getStakingPositionLedger`. */
  payouts: StakingPayoutRow[];
  /** True if more rows exist beyond this page — pass `nextCursor` back in to continue.
   *  Truncation is never silent (D3): always check this rather than assuming a full read. */
  hasMore: boolean;
  nextCursor: string | null;
  /** Exact count of rows matching the current filter (not just this page). */
  total: number;
}

export interface StakingRewardsQuery {
  /** D1: only payouts credited strictly after this ISO-8601 timestamp. */
  since?: string;
  /** D2: scope to one position's full ledger (ownership verified server-side). */
  positionId?: string;
  /** Page through a previous response's `nextCursor`. */
  cursor?: string;
  /** Page size; server default is 20 (no filters) or 50 (`since`/`positionId`), capped at 200. */
  limit?: number;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

const EMPTY_REWARDS: StakingRewards = { totalByCoin: {}, payouts: [], hasMore: false, nextCursor: null, total: 0 };

async function fetchStakingRewards(query: StakingRewardsQuery = {}): Promise<StakingRewards> {
  const qs = new URLSearchParams();
  if (query.since) qs.set('since', query.since);
  if (query.positionId) qs.set('positionId', query.positionId);
  if (query.cursor) qs.set('cursor', query.cursor);
  if (query.limit) qs.set('limit', String(query.limit));
  const q = qs.toString();
  const r = await getJson<{ ok: boolean; data: StakingRewards }>(
    q ? `/api/staking/rewards?${q}` : '/api/staking/rewards',
  );
  return r.data ?? EMPTY_REWARDS;
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

// --- DEEP CORE (Phase 0 game surface) --------------------------------------
// docs/specs/deep-core-05-screen-flow-frd.md G-7 — the game must not add its
// own polling / API round trips. Its derived state rides along on
// GET /api/staking/positions (the same request Staking.tsx's load() already
// makes), so this mirrors `getStakePositions()` but also reads the sibling
// `game` field from the same response body instead of issuing a second fetch.

/** Mirrors `web/src/lib/deepCoreProgress.ts`'s `XpProgress` — kept as a
 *  locally-owned client type per this file's existing convention (every
 *  other type here mirrors a server shape rather than importing it). */
export interface DeepCoreXpProgress {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number | null;
  xpTotal: number;
}

export interface DeepCoreWell {
  positionId: string;
  coin: string;
  principal: string;
  termDays: number;
  status: string;
  relativeSize: number;
  active: boolean;
  recentlyMatured: boolean;
}

export type DeepCoreSurfaceState =
  | 'S0_NOT_SHOWN'
  | 'S1_RUNNING'
  | 'S2_REPORTING_PAUSED'
  | 'S3_MAINTENANCE'
  | 'S4_IDLE_RIG'
  | 'S5_DISABLED';

export interface DeepCoreGameState {
  surfaceState: DeepCoreSurfaceState;
  xp: DeepCoreXpProgress;
  chapter: number;
  crew: string[];
  cosmeticSlots: string[];
  depotUnlocked: boolean;
  operatingDays: number;
  coreLogRank: number;
  svEarned: number;
  wells: DeepCoreWell[];
  activeWellCount: number;
  lastLiftAt: string | null;
  xpBreakdown: { lift: number; charterOpen: number; charterComplete: number };
  svBreakdown: { stratum: number; charterComplete: number; coreLog: number };
}

/** Positions + the DEEP CORE game block, in a single request (G-7). `game` is
 *  `null` when the derivation failed server-side (degrades gracefully — R-5)
 *  or was never returned by an older/mocked response shape.
 *
 *  `lockedPrincipal` (docs/specs/staking-page-v2-screen-flow-frd.md §4.2.2 ③ /
 *  R-D2) is the server's own per-coin sum of soft-locked principal — the
 *  SAME function the withdrawal route uses to compute the withdrawal lock.
 *  Callers must use this instead of summing `positions` client-side. */
export async function getStakePositionsAndGame(): Promise<{
  positions: StakePosition[];
  game: DeepCoreGameState | null;
  lockedPrincipal: Record<string, string>;
}> {
  const r = await getJson<{
    ok: boolean; data: StakePosition[]; game?: DeepCoreGameState | null; lockedPrincipal?: Record<string, string>;
  }>('/api/staking/positions');
  return { positions: Array.isArray(r.data) ? r.data : [], game: r.game ?? null, lockedPrincipal: r.lockedPrincipal ?? {} };
}

/** Real staking-interest rewards actually credited by the daily worker (most recent page, newest first). */
export async function getStakingRewards(): Promise<StakingRewards> {
  return fetchStakingRewards();
}

/**
 * Paginated legacy/default mode (newest-first across all positions), for
 * "load more" UIs (e.g. the Field Log) — same read as `getStakingRewards()`,
 * but accepts a cursor from a previous page's `nextCursor`. No server change:
 * `/api/staking/rewards` already supports `cursor`/`limit` in default mode.
 */
export async function getStakingRewardsPage(opts?: { cursor?: string; limit?: number }): Promise<StakingRewards> {
  return fetchStakingRewards({ ...opts });
}

/**
 * D1: every payout credited to the caller strictly after `since`, un-merged (one row
 * per staking-day), oldest first — for a catch-up read (e.g. the Shift Report).
 * Check `hasMore`/`nextCursor` — a large gap can exceed one page.
 */
export async function getStakingRewardsSince(
  since: string,
  opts?: { cursor?: string; limit?: number },
): Promise<StakingRewards> {
  return fetchStakingRewards({ since, ...opts });
}

/**
 * D2: the full payout ledger for one position (must belong to the caller), oldest
 * staking-day first. Check `hasMore`/`nextCursor` for long-term wells.
 */
export async function getStakingPositionLedger(
  positionId: string,
  opts?: { cursor?: string; limit?: number },
): Promise<StakingRewards> {
  return fetchStakingRewards({ positionId, ...opts });
}

/**
 * Lock funds into a staking product.
 *
 * staking-v2-auto-renew-cutover-ruling.md R-AR-2/R-AR-3 + T-8 FRD AR-3/DC-11
 * — the request body must NOT contain an `autoRenew` key at all (not even
 * `false`): the route rejects the mere presence of that key with 409
 * `AUTO_RENEW_UNAVAILABLE`, value irrelevant, because V2 has no renewal
 * decision engine yet (deferred to T-20). There is deliberately no
 * `autoRenew` parameter on this function any more — the STAKE_SHEET UI has
 * no control that could produce one (AR-2).
 *
 * Throws on failure; the thrown Error also carries a stable `.code`
 * (docs/specs/staking-page-v2-screen-flow-frd.md §7.1 R-D5 — e.g.
 * `STAKE_BELOW_MIN`) plus, for the codes that need one, `.params` (e.g.
 * `{ min, coin }`) so the caller renders a localized `staking.error.<code>`
 * string instead of the raw server message.
 */
export async function stake(productId: string, amount: string): Promise<{ id: string; maturityAt: string }> {
  const res = await fetch('/api/staking/stake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ productId, amount }),
  });
  const body: { ok: boolean; data?: { id: string; maturityAt: string }; error?: string; code?: string; params?: Record<string, string> } =
    await res.json().catch(() => ({ ok: false }));
  if (!res.ok || body?.ok === false) {
    const err = new Error(body?.error || `Request failed (${res.status})`) as Error & { code?: string; params?: Record<string, string> };
    err.code = body?.code;
    err.params = body?.params;
    throw err;
  }
  return body.data as { id: string; maturityAt: string };
}

/**
 * Turn the standing auto-renew instruction on/off for one owned position
 * (PRD §4 S4). Throws on failure with the server's English message; the
 * thrown Error also carries a stable `.code` (e.g. `AUTO_RENEW_TERM_TOO_LONG`)
 * so the caller can render a localized string via
 * `staking.autoRenew.error.<code>` instead of the raw English text.
 */
export async function setAutoRenew(positionId: string, autoRenew: boolean): Promise<StakePosition> {
  const res = await fetch(`/api/staking/positions/${encodeURIComponent(positionId)}/auto-renew`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ autoRenew }),
  });
  const body: { ok: boolean; data?: StakePosition; error?: string; code?: string } = await res.json().catch(() => ({ ok: false }));
  if (!res.ok || body?.ok === false) {
    const err = new Error(body?.error || `Request failed (${res.status})`) as Error & { code?: string };
    err.code = body?.code;
    throw err;
  }
  return body.data as StakePosition;
}
