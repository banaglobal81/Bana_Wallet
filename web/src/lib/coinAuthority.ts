import 'server-only';

// A-2 (V2-CORE) — Balance Authority Layer branching/probe/gating logic.
// Design doc: docs/specs/staking-yield-system-v2-design-a2-balance-authority.md
// (§4 is titled "web-shared-expert를 위한 인터페이스 계약" — this file is that contract's
// implementation. `prisma-db-expert` owns the ManagedCoin/CoinAuthorityProbe/
// CoinAuthorityTransition Prisma models themselves; this file owns the code that
// branches on/writes them.)
//
// STATUS: this module is now wired into live request paths — see
// web/src/app/api/nia/withdrawals/route.ts, web/src/app/api/nia/address/route.ts, and
// web/src/app/api/admin/withdrawals/[id]/approve/route.ts. It is no longer dead code;
// the rev03 §7.2 condition ③ constraint this comment used to document applied only
// pre-wiring.
//
// CLAUDE.md rule 2: all amount arithmetic uses decimal.js — never Number()/parseFloat.

import Decimal from 'decimal.js';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { niaRequest } from '@/lib/nia/client';

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export type CoinAuthorityBlockReason =
  | 'T2_HALTED'
  | 'T1_WARNING_NO_OVERRIDE'
  | 'DIRECT_CHANGE_IN_PROGRESS'
  | 'TRANSITION_IN_PROGRESS';

/** Thrown by assertIssuanceAllowed/assertExecutionAllowed/assertDepositAddressAllowed. */
export class CoinAuthorityBlockedError extends Error {
  readonly reason: CoinAuthorityBlockReason | 'DEPOSIT_ADDRESS_BLOCKED';
  readonly symbol: string;
  constructor(reason: CoinAuthorityBlockReason | 'DEPOSIT_ADDRESS_BLOCKED', symbol: string, message: string) {
    super(message);
    this.name = 'CoinAuthorityBlockedError';
    this.reason = reason;
    this.symbol = symbol;
  }
}

/** Thrown by changeAuthorityDirectly() step 2 (A-2 §4.6) — use the 5-step transition instead. */
export class DirectAuthorityChangeUnavailableError extends Error {
  readonly symbol: string;
  constructor(symbol: string, message: string) {
    super(message);
    this.name = 'DirectAuthorityChangeUnavailableError';
    this.symbol = symbol;
  }
}

// Status values under which a CoinAuthorityTransition counts as "in progress" and
// therefore blocks issuance/execution (A-2 §4.3, wallet-security-expert required fix
// 3's follow-on gap fix — FROZEN's comment alone didn't force the block).
const IN_PROGRESS_TRANSITION_STATUSES = ['FROZEN', 'SNAPSHOTTED', 'FUNDS_MOVED', 'RECONCILED'] as const;

// ---------------------------------------------------------------------------
// §4.1 — authority lookup, single entry point
// ---------------------------------------------------------------------------

/**
 * The ONE place "is this coin's balance-of-record HUB or LOCAL" is decided.
 * A-2 §4.1 — never reimplement the "no ManagedCoin row => HUB" fallback elsewhere.
 */
export async function getCoinAuthority(symbol: string): Promise<'HUB' | 'LOCAL'> {
  const coin = await prisma.managedCoin.findUnique({ where: { symbol }, select: { balanceAuthority: true } });
  return coin?.balanceAuthority ?? 'HUB';
}

// ---------------------------------------------------------------------------
// §4.3 — T1/T2 gating
// ---------------------------------------------------------------------------

type ManagedCoinGateRow = {
  id: string;
  authorityAlertStage: 'CLEAR' | 'T1_WARNING' | 'T2_HALTED';
  directAuthorityChangeInProgress: boolean;
  authorityTransitions: { id: string; status: string }[];
};

async function loadGateRow(symbol: string): Promise<ManagedCoinGateRow | null> {
  return prisma.managedCoin.findUnique({
    where: { symbol },
    select: {
      id: true,
      authorityAlertStage: true,
      directAuthorityChangeInProgress: true,
      authorityTransitions: {
        where: { status: { in: [...IN_PROGRESS_TRANSITION_STATUSES] } },
        select: { id: true, status: true },
        take: 1,
      },
    },
  });
}

/**
 * Throws on T2_HALTED, on T1_WARNING without an explicit admin-approved override, on
 * directAuthorityChangeInProgress === true, or on an in-flight CoinAuthorityTransition
 * (A-2 §4.3). No ManagedCoin row => implicitly HUB-authority with no A-2 gating state
 * to enforce => no-op (never throws).
 */
export async function assertIssuanceAllowed(
  symbol: string,
  opts?: { adminOverride?: { adminId: string; adminEmail: string } },
): Promise<void> {
  const coin = await loadGateRow(symbol);
  if (!coin) return;

  if (coin.authorityAlertStage === 'T2_HALTED') {
    throw new CoinAuthorityBlockedError('T2_HALTED', symbol, `${symbol}: T2 violation halt — issuance blocked.`);
  }
  if (coin.directAuthorityChangeInProgress) {
    throw new CoinAuthorityBlockedError(
      'DIRECT_CHANGE_IN_PROGRESS',
      symbol,
      `${symbol}: a direct authority change is in progress — issuance blocked.`,
    );
  }
  if (coin.authorityTransitions.length > 0) {
    throw new CoinAuthorityBlockedError(
      'TRANSITION_IN_PROGRESS',
      symbol,
      `${symbol}: authority transition ${coin.authorityTransitions[0].id} (${coin.authorityTransitions[0].status}) in progress — issuance blocked.`,
    );
  }
  if (coin.authorityAlertStage === 'T1_WARNING') {
    if (!opts?.adminOverride) {
      throw new CoinAuthorityBlockedError(
        'T1_WARNING_NO_OVERRIDE',
        symbol,
        `${symbol}: T1 warning (listed on the hub) — issuance requires an explicit admin override.`,
      );
    }
    // Explicit override taken — audited as its own action (A-2 §4.3).
    await recordAudit({
      adminId: opts.adminOverride.adminId,
      adminEmail: opts.adminOverride.adminEmail,
      action: 'AUTHORITY_T1_OVERRIDE',
      targetType: 'ManagedCoin',
      targetId: coin.id,
      detail: `Issuance override for ${symbol} while authorityAlertStage=T1_WARNING`,
    });
  }
}

/**
 * Withdrawal/settlement/new-position execution gate (A-2 §4.3). Unlike
 * assertIssuanceAllowed, T1_WARNING alone does NOT block WITHDRAWAL/SETTLEMENT — X-3′
 * says T1 blocks only new issuance while user-facing functions keep working. A new
 * staking position is treated as "new issuance" (a fresh liability), so it inherits
 * the T1 override requirement; WITHDRAWAL/SETTLEMENT never do.
 */
export async function assertExecutionAllowed(
  symbol: string,
  kind: 'WITHDRAWAL' | 'SETTLEMENT' | 'NEW_POSITION',
  opts?: { adminOverride?: { adminId: string; adminEmail: string } },
): Promise<void> {
  const coin = await loadGateRow(symbol);
  if (!coin) return;

  if (coin.authorityAlertStage === 'T2_HALTED') {
    throw new CoinAuthorityBlockedError('T2_HALTED', symbol, `${symbol}: T2 violation halt — ${kind} blocked.`);
  }
  if (coin.directAuthorityChangeInProgress) {
    throw new CoinAuthorityBlockedError(
      'DIRECT_CHANGE_IN_PROGRESS',
      symbol,
      `${symbol}: a direct authority change is in progress — ${kind} blocked.`,
    );
  }
  if (coin.authorityTransitions.length > 0) {
    throw new CoinAuthorityBlockedError(
      'TRANSITION_IN_PROGRESS',
      symbol,
      `${symbol}: authority transition ${coin.authorityTransitions[0].id} (${coin.authorityTransitions[0].status}) in progress — ${kind} blocked.`,
    );
  }
  if (kind === 'NEW_POSITION' && coin.authorityAlertStage === 'T1_WARNING') {
    if (!opts?.adminOverride) {
      throw new CoinAuthorityBlockedError(
        'T1_WARNING_NO_OVERRIDE',
        symbol,
        `${symbol}: T1 warning — new position (new issuance) requires an explicit admin override.`,
      );
    }
    await recordAudit({
      adminId: opts.adminOverride.adminId,
      adminEmail: opts.adminOverride.adminEmail,
      action: 'AUTHORITY_T1_OVERRIDE',
      targetType: 'ManagedCoin',
      targetId: coin.id,
      detail: `NEW_POSITION override for ${symbol} while authorityAlertStage=T1_WARNING`,
    });
  }
  // WITHDRAWAL/SETTLEMENT: query access is unaffected by any alert stage (X-3′ —
  // "queries always stay allowed"); this function only gates *execution*, and
  // T1_WARNING alone never blocks WITHDRAWAL/SETTLEMENT execution.
}

// ---------------------------------------------------------------------------
// §4.4 — deposit-address gating (X-7)
// ---------------------------------------------------------------------------

interface HubMarket {
  symbol?: string;
  currency?: string;
  [key: string]: unknown;
}

/**
 * Fail-closed deposit-address gate (A-2 §4.4). Address issuance is irreversible, so
 * this check is always real-time — it never trusts the cached authorityAlertStage or
 * lastProbeResult. Throws CoinAuthorityBlockedError('DEPOSIT_ADDRESS_BLOCKED', ...) to
 * block; resolves silently to allow.
 */
export async function assertDepositAddressAllowed(symbol: string): Promise<void> {
  const authority = await getCoinAuthority(symbol);

  if (authority === 'LOCAL') {
    await recordAudit({
      action: 'DEPOSIT_ADDRESS_BLOCKED_AUTHORITY',
      targetType: 'ManagedCoin',
      targetId: symbol,
      detail: `${symbol} is LOCAL-authority — hub deposit address must never be requested.`,
    });
    throw new CoinAuthorityBlockedError(
      'DEPOSIT_ADDRESS_BLOCKED',
      symbol,
      `${symbol}: LOCAL-authority coins have no hub deposit rail.`,
    );
  }

  // authority === 'HUB': also require the coin to be live on the hub's markets list
  // right now — a query failure is a block, not an allow (unknown != safe).
  let markets: unknown;
  try {
    markets = await niaRequest('GET', '/api/v1/markets');
  } catch (e) {
    await recordAudit({
      action: 'DEPOSIT_ADDRESS_BLOCKED_AUTHORITY',
      targetType: 'ManagedCoin',
      targetId: symbol,
      detail: `${symbol}: hub markets lookup failed (${(e as Error).message}) — fail-closed.`,
    });
    throw new CoinAuthorityBlockedError(
      'DEPOSIT_ADDRESS_BLOCKED',
      symbol,
      `${symbol}: could not verify hub listing — address issuance is blocked fail-closed.`,
    );
  }

  const list = Array.isArray(markets) ? (markets as HubMarket[]) : [];
  const listed = list.some((m) => (m.symbol ?? m.currency) === symbol);
  if (!listed) {
    await recordAudit({
      action: 'DEPOSIT_ADDRESS_BLOCKED_AUTHORITY',
      targetType: 'ManagedCoin',
      targetId: symbol,
      detail: `${symbol}: HUB-authority but not present in the current hub markets response.`,
    });
    throw new CoinAuthorityBlockedError(
      'DEPOSIT_ADDRESS_BLOCKED',
      symbol,
      `${symbol}: not currently listed on the hub — address issuance is blocked.`,
    );
  }
}

// ---------------------------------------------------------------------------
// §4.6 — direct authority change (zero-balance fast path), TOCTOU-safe
// ---------------------------------------------------------------------------

interface ManagedCoinLockRow {
  id: string;
  symbol: string;
  balanceAuthority: 'HUB' | 'LOCAL';
  authorityAlertStage: 'CLEAR' | 'T1_WARNING' | 'T2_HALTED';
  directAuthorityChangeInProgress: boolean;
}

/**
 * changeAuthorityDirectly (A-2 §4.6, wallet-security-expert required fix 3 — TOCTOU).
 * A single function, single DB transaction: lock the ManagedCoin row, re-verify
 * preconditions under that lock, and if this coin's LOCAL-ledger balance sums to
 * exactly "0" with no unresolved T2 history, flip balanceAuthority immediately in the
 * same transaction. No separate "judge, then write" two-call API — that gap was the
 * TOCTOU (§4.6 intro).
 *
 * `CoinBalanceAuthority` is a 2-value enum (HUB | LOCAL) and the A-2 §4.6 interface
 * signature is deliberately `(symbol, actor)` with no explicit target — "change"
 * therefore means *toggle* to the other value. (This is an explicit design decision
 * filling a genuine gap in A-2 §4.6's signature, not literal doc text — flagged here
 * for wallet-security-expert/prisma-db-expert to confirm before this is ever wired up.)
 *
 * changed === false => condition unmet; caller must instead create a
 * CoinAuthorityTransition (DRAFT) and walk the 5-step procedure.
 * Throws DirectAuthorityChangeUnavailableError if a direct change is already in
 * progress or the coin is T2_HALTED — those cases are never eligible for this
 * fast path regardless of balance.
 */
export async function changeAuthorityDirectly(
  symbol: string,
  actor: { adminId: string; adminEmail: string },
): Promise<{ changed: boolean; managedCoin: ManagedCoinLockRow }> {
  return prisma.$transaction(async (tx) => {
    // Step 1 — lock-then-check: SELECT ... FOR UPDATE on the ManagedCoin row. This is
    // the same row A-3's creditLocalLedger (issuance reason codes) locks, by design —
    // whichever transaction acquires the lock first, the other waits for it to commit.
    const rows = await tx.$queryRaw<ManagedCoinLockRow[]>`
      SELECT id, symbol, "balanceAuthority", "authorityAlertStage", "directAuthorityChangeInProgress"
      FROM "ManagedCoin" WHERE symbol = ${symbol} FOR UPDATE
    `;
    const coin = rows[0];
    if (!coin) {
      throw new DirectAuthorityChangeUnavailableError(symbol, `${symbol}: no ManagedCoin row — nothing to change.`);
    }

    // Step 2 — re-verify under the lock. Immediate exception (not changed:false) —
    // these states mean "use the 5-step transition procedure instead", not "not yet".
    if (coin.directAuthorityChangeInProgress) {
      throw new DirectAuthorityChangeUnavailableError(
        symbol,
        `${symbol}: a direct authority change is already in progress.`,
      );
    }
    if (coin.authorityAlertStage === 'T2_HALTED') {
      throw new DirectAuthorityChangeUnavailableError(
        symbol,
        `${symbol}: T2_HALTED — use the 5-step CoinAuthorityTransition procedure, not a direct change.`,
      );
    }

    // Step 3 — set the in-progress flag under the same lock/transaction. From this
    // point, assertIssuanceAllowed() blocks new issuance for this coin until we clear
    // the flag below (either path).
    await tx.managedCoin.update({ where: { id: coin.id }, data: { directAuthorityChangeInProgress: true } });

    // Step 4 — application-level (decimal.js) sum of every UserCoinBalance row for
    // this coin. Never a Postgres SUM (CLAUDE.md rule 2). Zero rows sums to "0".
    const balances = await tx.userCoinBalance.findMany({ where: { coin: symbol }, select: { balance: true } });
    const balanceTotal = balances.reduce((acc, b) => acc.plus(new Decimal(b.balance)), new Decimal(0));

    // Step 5 — judge. Conservative reading of "no recent probe observed a nonzero hub
    // balance": block if ANY T2_VIOLATION probe was ever recorded for this coin,
    // regardless of the current (already-checked) authorityAlertStage — a stricter
    // check than the literal doc text, chosen because there is no "resolved" marker
    // on CoinAuthorityProbe to distinguish a stale violation from a cleared one.
    const everViolated = coin.id
      ? await tx.coinAuthorityProbe.findFirst({ where: { managedCoinId: coin.id, result: 'T2_VIOLATION' } })
      : null;
    const eligible = balanceTotal.isZero() && !everViolated;

    if (!eligible) {
      await tx.managedCoin.update({ where: { id: coin.id }, data: { directAuthorityChangeInProgress: false } });
      const reverted = await tx.managedCoin.findUniqueOrThrow({
        where: { id: coin.id },
        select: {
          id: true,
          symbol: true,
          balanceAuthority: true,
          authorityAlertStage: true,
          directAuthorityChangeInProgress: true,
        },
      });
      return { changed: false, managedCoin: reverted };
    }

    const nextAuthority = coin.balanceAuthority === 'LOCAL' ? 'HUB' : 'LOCAL';
    const updated = await tx.managedCoin.update({
      where: { id: coin.id },
      data: { balanceAuthority: nextAuthority, directAuthorityChangeInProgress: false },
      select: {
        id: true,
        symbol: true,
        balanceAuthority: true,
        authorityAlertStage: true,
        directAuthorityChangeInProgress: true,
      },
    });
    await tx.auditLog.create({
      data: {
        adminId: actor.adminId,
        adminEmail: actor.adminEmail,
        action: 'COIN_AUTHORITY_DIRECT_CHANGE',
        targetType: 'ManagedCoin',
        targetId: coin.id,
        detail: `${symbol}: ${coin.balanceAuthority} -> ${nextAuthority} (direct, zero-balance path)`,
      },
    });
    return { changed: true, managedCoin: updated };
  });
}

// ---------------------------------------------------------------------------
// §4.3 — T1/T2 probe execution (X-3′/X-6). No scheduling here — a future worker
// registration step (out of scope for this task) calls runAuthorityProbe on its own
// cadence, per PlatformSetting.authorityProbe*.
// ---------------------------------------------------------------------------

export type AuthorityProbeSource = 'WORKER_PERIODIC' | 'WALLET_READ_OPPORTUNISTIC' | 'MANUAL_ADMIN';

export interface AuthorityProbeObservation {
  source: AuthorityProbeSource;
  /** Was this LOCAL-authority coin's symbol present in the hub's markets response? undefined = query failed/unknown. */
  hubListed?: boolean;
  /** Present only when the hub reported a nonzero end-user balance for this coin. */
  hubBalanceObserved?: { userId: string; amount: string } | null;
}

/**
 * Records one probe observation + updates ManagedCoin's cached alert-stage judgement,
 * atomically (A-2 §4.3). Deliberately takes already-observed signals rather than
 * calling the hub itself — the periodic worker and the opportunistic (piggybacked on
 * a user's hub balance read) path both converge here, but each is responsible for
 * gathering its own raw signal (A-2 §6-1 leaves this split to A-5/this file; this
 * implementation keeps the function itself read-only and I/O-source-agnostic).
 * Only ever escalates alertStage (CLEAR -> T1_WARNING -> T2_HALTED) — never
 * auto-downgrades. Recovery from T1_WARNING/T2_HALTED is an explicit admin/5-step
 * transition action, not a side effect of a later CLEAN probe (fail-closed by design;
 * left as an explicit open question for future review, mirroring A-2 §6).
 */
export async function runAuthorityProbe(
  managedCoinId: string,
  observation: AuthorityProbeObservation,
): Promise<{
  id: string;
  result: 'CLEAN' | 'UNKNOWN' | 'T1_LISTED' | 'T2_VIOLATION';
  consecutiveUnknownCount: number;
}> {
  return prisma.$transaction(async (tx) => {
    const coin = await tx.managedCoin.findUniqueOrThrow({
      where: { id: managedCoinId },
      select: { id: true, symbol: true, balanceAuthority: true, authorityAlertStage: true },
    });

    const observedNonzero =
      observation.hubBalanceObserved && new Decimal(observation.hubBalanceObserved.amount).gt(0);

    let result: 'CLEAN' | 'UNKNOWN' | 'T1_LISTED' | 'T2_VIOLATION';
    if (observedNonzero) result = 'T2_VIOLATION';
    else if (observation.hubListed === true) result = 'T1_LISTED';
    else if (observation.hubListed === false) result = 'CLEAN';
    else result = 'UNKNOWN'; // hub query failed/unavailable — not a violation (A-2 §1 principle 5)

    const lastProbe = await tx.coinAuthorityProbe.findFirst({
      where: { managedCoinId },
      orderBy: { probedAt: 'desc' },
      select: { consecutiveUnknownCount: true },
    });
    const consecutiveUnknownCount = result === 'UNKNOWN' ? (lastProbe?.consecutiveUnknownCount ?? 0) + 1 : 0;

    const probe = await tx.coinAuthorityProbe.create({
      data: {
        managedCoinId,
        coinSymbol: coin.symbol,
        authorityAtProbe: coin.balanceAuthority,
        result,
        hubListed: observation.hubListed ?? false,
        hubBalanceUserId: observation.hubBalanceObserved?.userId ?? null,
        hubBalanceAmount: observation.hubBalanceObserved?.amount ?? null,
        consecutiveUnknownCount,
        source: observation.source,
      },
      select: { id: true, result: true, consecutiveUnknownCount: true },
    });

    // Cached judgement update (X-6 escalation-only policy — see doc comment above).
    const settings = await tx.platformSetting.findUnique({ where: { id: 'singleton' } });
    const escalationCount = settings?.authorityProbeUnknownEscalationCount ?? 3;

    let nextStage: 'CLEAR' | 'T1_WARNING' | 'T2_HALTED' | null = null;
    if (result === 'T2_VIOLATION') {
      nextStage = 'T2_HALTED';
    } else if (result === 'T1_LISTED' || (result === 'UNKNOWN' && consecutiveUnknownCount >= escalationCount)) {
      if (coin.authorityAlertStage === 'CLEAR') nextStage = 'T1_WARNING';
    }
    if (nextStage && nextStage !== coin.authorityAlertStage) {
      await tx.managedCoin.update({
        where: { id: managedCoinId },
        data: {
          authorityAlertStage: nextStage,
          authorityAlertSince: new Date(),
          lastProbeAt: new Date(),
          lastProbeResult: result,
        },
      });
    } else {
      await tx.managedCoin.update({
        where: { id: managedCoinId },
        data: { lastProbeAt: new Date(), lastProbeResult: result },
      });
    }

    return probe;
  });
}

// ---------------------------------------------------------------------------
// §2.4 — X-4′ five-step authority transition state machine
// ---------------------------------------------------------------------------

type TransitionDirection = 'LOCAL_TO_HUB' | 'HUB_TO_LOCAL';
type TransitionStatus = 'DRAFT' | 'FROZEN' | 'SNAPSHOTTED' | 'FUNDS_MOVED' | 'RECONCILED' | 'COMPLETED' | 'ABORTED';

/** Step 0 — create the DRAFT row. Not yet frozen; issuance is NOT blocked by a DRAFT row. */
export async function createAuthorityTransition(opts: {
  symbol: string;
  direction: TransitionDirection;
  initiatedByAdminId: string;
  initiatedByEmail: string;
  triggeredByProbeId?: string;
}) {
  const coin = await prisma.managedCoin.findUniqueOrThrow({ where: { symbol: opts.symbol }, select: { id: true } });
  const transition = await prisma.coinAuthorityTransition.create({
    data: {
      managedCoinId: coin.id,
      coinSymbol: opts.symbol,
      direction: opts.direction,
      status: 'DRAFT',
      initiatedByAdminId: opts.initiatedByAdminId,
      initiatedByEmail: opts.initiatedByEmail,
      triggeredByProbeId: opts.triggeredByProbeId ?? null,
    },
  });
  await recordAudit({
    adminId: opts.initiatedByAdminId,
    adminEmail: opts.initiatedByEmail,
    action: 'COIN_AUTHORITY_TRANSITION_CREATED',
    targetType: 'CoinAuthorityTransition',
    targetId: transition.id,
    detail: `${opts.symbol}: ${opts.direction} transition created (DRAFT)`,
  });
  return transition;
}

async function claimTransition(id: string, from: TransitionStatus, data: Prisma.CoinAuthorityTransitionUpdateInput) {
  const claim = await prisma.coinAuthorityTransition.updateMany({ where: { id, status: from }, data });
  if (claim.count !== 1) {
    const existing = await prisma.coinAuthorityTransition.findUnique({ where: { id }, select: { status: true } });
    throw new Error(
      `CoinAuthorityTransition ${id}: expected status ${from}, found ${existing?.status ?? '(not found)'} — atomic claim failed.`,
    );
  }
  return prisma.coinAuthorityTransition.findUniqueOrThrow({ where: { id } });
}

/** Step 1 — freeze. From this moment, assertIssuanceAllowed/assertExecutionAllowed block this coin. */
export async function freezeAuthorityTransition(id: string) {
  return claimTransition(id, 'DRAFT', { status: 'FROZEN', frozenAt: new Date() });
}

/** Step 2 — snapshot. Immutable once recorded (caller creates the LocalBalanceSnapshotBatch — A-3 §2.4). */
export async function snapshotAuthorityTransition(id: string, opts: { snapshotBatchId: string; snapshotTotal: string }) {
  return claimTransition(id, 'FROZEN', {
    status: 'SNAPSHOTTED',
    snapshotAt: new Date(),
    snapshotRef: opts.snapshotBatchId,
    snapshotTotal: opts.snapshotTotal,
  });
}

/** Step 3 — record the actual (manually executed, non-custodial) funds movement. */
export async function recordFundsMovedAuthorityTransition(
  id: string,
  opts: { fundsMovedTxRef: string; fundsMovedAmount: string },
) {
  return claimTransition(id, 'SNAPSHOTTED', {
    status: 'FUNDS_MOVED',
    fundsMovedAt: new Date(),
    fundsMovedTxRef: opts.fundsMovedTxRef,
    fundsMovedAmount: opts.fundsMovedAmount,
  });
}

/**
 * Step 4 — reconciliation. reconciliationMismatch must normalize to exactly "0"
 * (decimal.js) — a hard assertion, not a soft warning (A-2 §4.6 closing bullet).
 */
export async function reconcileAuthorityTransition(id: string, opts: { reconciliationMismatch: string }) {
  if (!new Decimal(opts.reconciliationMismatch).isZero()) {
    throw new Error(
      `CoinAuthorityTransition ${id}: reconciliationMismatch must be exactly "0" to proceed to RECONCILED (got ${opts.reconciliationMismatch}).`,
    );
  }
  return claimTransition(id, 'FUNDS_MOVED', {
    status: 'RECONCILED',
    reconciledAt: new Date(),
    reconciliationMismatch: opts.reconciliationMismatch,
  });
}

/** Step 5 — completion: flip balanceAuthority + resume, in one transaction with the status claim. */
export async function completeAuthorityTransition(id: string) {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.coinAuthorityTransition.updateMany({
      where: { id, status: 'RECONCILED' },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    if (claim.count !== 1) {
      throw new Error(`CoinAuthorityTransition ${id}: expected status RECONCILED — atomic claim failed.`);
    }
    const transition = await tx.coinAuthorityTransition.findUniqueOrThrow({ where: { id } });
    const nextAuthority = transition.direction === 'HUB_TO_LOCAL' ? 'LOCAL' : 'HUB';
    await tx.managedCoin.update({
      where: { id: transition.managedCoinId },
      data: { balanceAuthority: nextAuthority },
    });
    await tx.auditLog.create({
      data: {
        adminId: transition.initiatedByAdminId,
        adminEmail: transition.initiatedByEmail,
        action: 'COIN_AUTHORITY_TRANSITION_COMPLETED',
        targetType: 'CoinAuthorityTransition',
        targetId: transition.id,
        detail: `${transition.coinSymbol}: ${transition.direction} completed -> balanceAuthority=${nextAuthority}`,
      },
    });
    return transition;
  });
}

/** Abort from any non-terminal status. Authority field is untouched (never partially applied). */
export async function abortAuthorityTransition(id: string, opts: { reason: string }) {
  const claim = await prisma.coinAuthorityTransition.updateMany({
    where: { id, status: { in: ['DRAFT', 'FROZEN', 'SNAPSHOTTED', 'FUNDS_MOVED', 'RECONCILED'] } },
    data: { status: 'ABORTED', abortedAt: new Date(), abortReason: opts.reason },
  });
  if (claim.count !== 1) {
    throw new Error(`CoinAuthorityTransition ${id}: not in an abortable status — atomic claim failed.`);
  }
  return prisma.coinAuthorityTransition.findUniqueOrThrow({ where: { id } });
}
