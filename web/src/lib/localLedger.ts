import 'server-only';

// A-3 (V2-CORE) — Local Balance Ledger business logic.
// Design doc: docs/specs/staking-yield-system-v2-design-a3-local-ledger.md (§4 is the
// "interface contract for the next owner" — this file implements that contract).
// rev04 (staking-yield-system-v2-prd-rev04-core-design-synthesis.md) PoR-1″ addendum
// is folded into that design doc already; this file follows the addendum, not the
// pre-rev04 PoR-1′ text.
//
// STATUS: this module is now wired into live request paths — see
// web/src/app/api/nia/withdrawals/route.ts, web/src/app/api/wallet/local-balance/route.ts,
// web/src/app/api/admin/withdrawals/[id]/reject/route.ts, and
// web/src/app/api/admin/reserve/verify/route.ts. It is no longer dead code; the rev03
// §7.2 condition ③ constraint this comment used to document applied only pre-wiring.
//
// CLAUDE.md rule 2: all amount arithmetic uses decimal.js — never Number()/parseFloat.

import Decimal from 'decimal.js';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { getPlatformSettings } from '@/lib/platformSettings';
import { assertIssuanceAllowed } from '@/lib/coinAuthority';

type Client = Prisma.TransactionClient | typeof prisma;

// ---------------------------------------------------------------------------
// §4.1 — balance read
// ---------------------------------------------------------------------------

export interface UserCoinBalanceView {
  balance: string;
  held: string;
  available: string;
}

/**
 * A-3 §4.1. `opts.tx` joins the caller's transaction (no new transaction opened).
 * `opts.forUpdate` requires `opts.tx` (a lock is meaningless outside a transaction) —
 * throws synchronously otherwise. Reads with `forUpdate` are the only ones safe to
 * base a same-transaction write decision on (placeHold/credit/debit do this
 * internally); a plain read is for display purposes only.
 */
export async function getUserCoinBalance(
  userId: string,
  coin: string,
  opts?: { tx?: Prisma.TransactionClient; forUpdate?: boolean },
): Promise<UserCoinBalanceView> {
  if (opts?.forUpdate && !opts.tx) {
    throw new Error('getUserCoinBalance: forUpdate requires opts.tx (a row lock only makes sense inside a transaction).');
  }

  let balanceStr: string;
  if (opts?.forUpdate && opts.tx) {
    const rows = await opts.tx.$queryRaw<{ balance: string }[]>`
      SELECT balance FROM "UserCoinBalance" WHERE "userId" = ${userId} AND coin = ${coin} FOR UPDATE
    `;
    if (rows[0]) {
      balanceStr = rows[0].balance;
    } else {
      const created = await opts.tx.userCoinBalance.create({ data: { userId, coin, balance: '0' } });
      balanceStr = created.balance;
    }
  } else {
    const client: Client = opts?.tx ?? prisma;
    const row = await client.userCoinBalance.findUnique({ where: { userId_coin: { userId, coin } }, select: { balance: true } });
    balanceStr = row?.balance ?? '0';
  }

  const client: Client = opts?.tx ?? prisma;
  const holds = await client.localBalanceHold.findMany({
    where: { userId, coin, status: 'ACTIVE' },
    select: { amount: true },
  });
  const held = holds.reduce((acc, h) => acc.plus(new Decimal(h.amount)), new Decimal(0));
  const balance = new Decimal(balanceStr);
  return { balance: balance.toFixed(), held: held.toFixed(), available: balance.minus(held).toFixed() };
}

// ---------------------------------------------------------------------------
// §4.2 — credit / debit (shared function, issuance gating for credits)
// ---------------------------------------------------------------------------

// A-3 §4.2 — the only credit reason codes that increase PoR-1″'s left-hand side
// (liability). AUTHORITY_TRANSITION_CREDIT_IN is excluded (the 5-step transition
// already freezes issuance — a second gate is redundant, A-2 §4.6). ADMIN_ADJUSTMENT_*
// is excluded (manual corrections must be able to bypass an automated gate — audited
// via createdByAdminId/adjustmentReason + AuditLog instead).
const ISSUANCE_CREDIT_REASON_CODES = new Set([
  'STAKING_CLAIM',
  'GRANT_PRINCIPAL_CREDIT',
  'DEPOSIT_CONFIRMED',
  'REFERRAL_BONUS_CREDIT',
]);

export type LocalLedgerReasonCodeValue =
  | 'STAKING_CLAIM'
  | 'GRANT_PRINCIPAL_CREDIT'
  | 'DEPOSIT_CONFIRMED'
  | 'REFERRAL_BONUS_CREDIT'
  | 'AUTHORITY_TRANSITION_CREDIT_IN'
  | 'ADMIN_ADJUSTMENT_CREDIT'
  | 'WITHDRAWAL_EXECUTED'
  | 'AUTHORITY_TRANSITION_DEBIT_OUT'
  | 'ADMIN_ADJUSTMENT_DEBIT';

export interface LedgerMutationInput {
  userId: string;
  coin: string;
  /** canonical positive decimal string — sign is carried by CREDIT/DEBIT, never by this field */
  amount: string;
  reasonCode: LocalLedgerReasonCodeValue;
  idempotencyKey?: string | null;
  relatedType?: string | null;
  relatedId?: string | null;
  createdByAdminId?: string | null;
  createdByEmail?: string | null;
  adjustmentReason?: string | null;
  tx?: Prisma.TransactionClient;
}

interface LocalLedgerEntryRow {
  id: string;
  userId: string;
  coin: string;
  type: string;
  reasonCode: string;
  amount: string;
  balanceAfter: string;
  idempotencyKey: string | null;
  relatedType: string | null;
  relatedId: string | null;
}

async function mutateLocalLedger(
  input: LedgerMutationInput,
  type: 'CREDIT' | 'DEBIT',
): Promise<LocalLedgerEntryRow> {
  const amount = new Decimal(input.amount);
  if (!amount.isFinite() || amount.lte(0)) {
    throw new Error(
      `${type === 'CREDIT' ? 'creditLocalLedger' : 'debitLocalLedger'}: amount must be a positive decimal string (got "${input.amount}").`,
    );
  }
  if (
    input.reasonCode.startsWith('ADMIN_ADJUSTMENT') &&
    (!input.createdByAdminId || !input.createdByEmail || !input.adjustmentReason)
  ) {
    throw new Error(`${input.reasonCode} requires createdByAdminId + createdByEmail + adjustmentReason (A-3 §4.2).`);
  }

  const run = async (tx: Prisma.TransactionClient): Promise<LocalLedgerEntryRow> => {
    // Idempotent no-op: a prior identical credit/debit already landed.
    if (input.idempotencyKey) {
      const existing = await tx.localLedgerEntry.findUnique({
        where: { coin_idempotencyKey: { coin: input.coin, idempotencyKey: input.idempotencyKey } },
      });
      if (existing) return existing;
    }

    const isIssuance = type === 'CREDIT' && ISSUANCE_CREDIT_REASON_CODES.has(input.reasonCode);
    if (isIssuance) {
      // Step 0 (A-3 §4.2) — lock the ManagedCoin row. This is the SAME row and lock
      // mode A-2's changeAuthorityDirectly() takes (A-2 §4.6) — whichever transaction
      // acquires it first, the other waits until commit. Serializes "authority
      // changing" against "issuance happening" for this coin.
      await tx.$queryRaw`SELECT id FROM "ManagedCoin" WHERE symbol = ${input.coin} FOR UPDATE`;

      // Step 1 — re-verify issuance gating under that lock. assertIssuanceAllowed()
      // reads via the plain `prisma` client (a different connection than `tx`), which
      // is safe here: a plain SELECT never blocks on another transaction's row lock
      // under Postgres READ COMMITTED, and it reads the latest COMMITTED state — which
      // cannot change out from under us because our FOR UPDATE lock (above) blocks any
      // concurrent transaction that would need to write that same ManagedCoin row
      // (e.g. changeAuthorityDirectly) until we commit.
      await assertIssuanceAllowed(input.coin);

      // Step 2 — PoR-1″ synchronous gate (rev04 PoR-G2 signature: coin + amount).
      // Throws ReserveGateBlockedError; the LocalLedgerEntry below is never inserted.
      await assertReserveHealthyOrThrow(input.coin, input.amount);
    }

    // Step 3 — lock (or create) the UserCoinBalance row, compute the new balance,
    // insert the ledger entry, and update the cache — atomically in this transaction.
    const rows = await tx.$queryRaw<{ id: string; balance: string }[]>`
      SELECT id, balance FROM "UserCoinBalance" WHERE "userId" = ${input.userId} AND coin = ${input.coin} FOR UPDATE
    `;
    let current = rows[0];
    if (!current) {
      const created = await tx.userCoinBalance.create({ data: { userId: input.userId, coin: input.coin, balance: '0' } });
      current = { id: created.id, balance: created.balance };
    }

    const currentBalance = new Decimal(current.balance);
    const newBalance = type === 'CREDIT' ? currentBalance.plus(amount) : currentBalance.minus(amount);
    if (type === 'DEBIT' && newBalance.isNegative()) {
      throw new Error(
        `debitLocalLedger: insufficient balance for ${input.userId}/${input.coin} (balance ${current.balance}, debit ${amount.toFixed()}) — no partial debit.`,
      );
    }

    const entry = await tx.localLedgerEntry.create({
      data: {
        userId: input.userId,
        coin: input.coin,
        type,
        reasonCode: input.reasonCode,
        amount: amount.toFixed(),
        balanceAfter: newBalance.toFixed(),
        idempotencyKey: input.idempotencyKey ?? null,
        relatedType: input.relatedType ?? null,
        relatedId: input.relatedId ?? null,
        createdByAdminId: input.createdByAdminId ?? null,
        createdByEmail: input.createdByEmail ?? null,
        adjustmentReason: input.adjustmentReason ?? null,
      },
    });

    await tx.userCoinBalance.update({
      where: { id: current.id },
      data: { balance: newBalance.toFixed(), version: { increment: 1 } },
    });

    if (input.reasonCode.startsWith('ADMIN_ADJUSTMENT')) {
      await tx.auditLog.create({
        data: {
          adminId: input.createdByAdminId!,
          adminEmail: input.createdByEmail!,
          action: type === 'CREDIT' ? 'LOCAL_LEDGER_ADMIN_ADJUSTMENT_CREDIT' : 'LOCAL_LEDGER_ADMIN_ADJUSTMENT_DEBIT',
          targetType: 'UserCoinBalance',
          targetId: current.id,
          detail: `${input.userId}/${input.coin}: ${type} ${amount.toFixed()} — ${input.adjustmentReason}`,
        },
      });
    }

    return entry;
  };

  if (input.tx) return run(input.tx);
  return prisma.$transaction(run);
}

export async function creditLocalLedger(input: LedgerMutationInput): Promise<LocalLedgerEntryRow> {
  return mutateLocalLedger(input, 'CREDIT');
}

export async function debitLocalLedger(input: LedgerMutationInput): Promise<LocalLedgerEntryRow> {
  return mutateLocalLedger(input, 'DEBIT');
}

// ---------------------------------------------------------------------------
// §4.3 — holds
// ---------------------------------------------------------------------------

interface LocalBalanceHoldRow {
  id: string;
  userId: string;
  coin: string;
  amount: string;
  reasonCode: string;
  status: string;
  relatedType: string;
  relatedId: string | null;
  executedLedgerEntryId: string | null;
}

/**
 * A-3 §4.3. `tx` is REQUIRED (not optional) — placeHold is almost always paired with
 * creating the request record it backs (WithdrawalRequest / StakePositionV2), and
 * both must land in the same transaction (A-5 §3.2's TOCTOU discussion). Locks the
 * UserCoinBalance row for the duration of the transaction — this is the mechanism
 * that serializes concurrent placeHold calls for the same user+coin and closes the
 * "balance 100, three concurrent 100-amount requests" race (A-5 §3.2).
 */
export async function placeHold(input: {
  userId: string;
  coin: string;
  amount: string;
  reasonCode: 'WITHDRAWAL_PENDING' | 'STAKE_PRINCIPAL_LOCK';
  relatedType: string;
  relatedId?: string | null;
  tx: Prisma.TransactionClient;
}): Promise<LocalBalanceHoldRow> {
  const amount = new Decimal(input.amount);
  if (!amount.isFinite() || amount.lte(0)) {
    throw new Error(`placeHold: amount must be a positive decimal string (got "${input.amount}").`);
  }
  const tx = input.tx;

  const rows = await tx.$queryRaw<{ id: string; balance: string }[]>`
    SELECT id, balance FROM "UserCoinBalance" WHERE "userId" = ${input.userId} AND coin = ${input.coin} FOR UPDATE
  `;
  let current = rows[0];
  if (!current) {
    const created = await tx.userCoinBalance.create({ data: { userId: input.userId, coin: input.coin, balance: '0' } });
    current = { id: created.id, balance: created.balance };
  }

  const activeHolds = await tx.localBalanceHold.findMany({
    where: { userId: input.userId, coin: input.coin, status: 'ACTIVE' },
    select: { amount: true },
  });
  const held = activeHolds.reduce((acc, h) => acc.plus(new Decimal(h.amount)), new Decimal(0));
  const available = new Decimal(current.balance).minus(held);
  if (amount.gt(available)) {
    throw Object.assign(
      new Error(
        `placeHold: insufficient available balance for ${input.userId}/${input.coin} (available ${available.toFixed()}, requested ${amount.toFixed()}).`,
      ),
      { code: 'INSUFFICIENT_AVAILABLE_BALANCE' },
    );
  }

  return tx.localBalanceHold.create({
    data: {
      userId: input.userId,
      coin: input.coin,
      amount: amount.toFixed(),
      reasonCode: input.reasonCode,
      status: 'ACTIVE',
      relatedType: input.relatedType,
      relatedId: input.relatedId ?? null,
    },
  });
}

/**
 * A-3 §4.3. ACTIVE -> RELEASED. No ledger entry, balance unchanged. `tx` optional —
 * safe standalone (an atomic status claim, no UserCoinBalance write).
 */
export async function releaseHold(
  holdId: string,
  releasedReason: string,
  opts?: { tx?: Prisma.TransactionClient },
): Promise<LocalBalanceHoldRow> {
  const client: Client = opts?.tx ?? prisma;
  const claim = await client.localBalanceHold.updateMany({
    where: { id: holdId, status: 'ACTIVE' },
    data: { status: 'RELEASED', releasedAt: new Date(), releasedReason },
  });
  if (claim.count !== 1) {
    throw new Error(`releaseHold: hold ${holdId} is not ACTIVE — atomic claim failed (already released/executed?).`);
  }
  return client.localBalanceHold.findUniqueOrThrow({ where: { id: holdId } });
}

/**
 * A-3 §4.3. WITHDRAWAL_PENDING holds only — STAKE_PRINCIPAL_LOCK never transitions to
 * EXECUTED (it is a soft lock, forever ACTIVE -> RELEASED only). Same N-30-style
 * atomic claim (ACTIVE -> EXECUTED, count===1) + a debitLocalLedger(WITHDRAWAL_EXECUTED)
 * in the SAME transaction — this is the actual burn.
 */
export async function executeHold(
  holdId: string,
  opts: {
    reasonCode: 'WITHDRAWAL_EXECUTED';
    idempotencyKey: string;
    relatedType?: string;
    relatedId?: string;
    tx?: Prisma.TransactionClient;
  },
): Promise<{ hold: LocalBalanceHoldRow; ledgerEntry: LocalLedgerEntryRow }> {
  const run = async (tx: Prisma.TransactionClient) => {
    const hold = await tx.localBalanceHold.findUniqueOrThrow({ where: { id: holdId } });
    if (hold.reasonCode !== 'WITHDRAWAL_PENDING') {
      throw new Error(
        `executeHold: hold ${holdId} has reasonCode ${hold.reasonCode} — only WITHDRAWAL_PENDING holds may be executed (STAKE_PRINCIPAL_LOCK never transitions to EXECUTED, A-3 §1 principle 2).`,
      );
    }

    // Debit first (also validates ACTIVE-ness indirectly via the hold's own amount) —
    // this is a pure debit reason code (not in ISSUANCE_CREDIT_REASON_CODES), so it
    // skips the ManagedCoin lock/gates entirely (A-3 §4.2 "pure debit codes skip 0-2").
    const entry = await debitLocalLedger({
      userId: hold.userId,
      coin: hold.coin,
      amount: hold.amount,
      reasonCode: opts.reasonCode,
      idempotencyKey: opts.idempotencyKey,
      relatedType: opts.relatedType ?? hold.relatedType,
      relatedId: opts.relatedId ?? hold.relatedId ?? undefined,
      tx,
    });

    const claim = await tx.localBalanceHold.updateMany({
      where: { id: holdId, status: 'ACTIVE' },
      data: { status: 'EXECUTED', executedLedgerEntryId: entry.id },
    });
    if (claim.count !== 1) {
      throw new Error(`executeHold: hold ${holdId} is not ACTIVE — atomic claim failed (concurrent execute/release?).`);
    }

    return { hold: await tx.localBalanceHold.findUniqueOrThrow({ where: { id: holdId } }), ledgerEntry: entry };
  };

  if (opts.tx) return run(opts.tx);
  return prisma.$transaction(run);
}

// ---------------------------------------------------------------------------
// §4.4 — reconciliation (cache vs. evidence)
// ---------------------------------------------------------------------------

export async function reconcileUserCoinBalances(
  coin: string,
): Promise<{ checked: number; mismatches: Array<{ userId: string; cached: string; derived: string }> }> {
  const balances = await prisma.userCoinBalance.findMany({ where: { coin } });
  const mismatches: Array<{ userId: string; cached: string; derived: string }> = [];

  for (const b of balances) {
    const entries = await prisma.localLedgerEntry.findMany({
      where: { userId: b.userId, coin },
      select: { type: true, amount: true },
    });
    const derived = entries.reduce(
      (acc, e) => (e.type === 'CREDIT' ? acc.plus(new Decimal(e.amount)) : acc.minus(new Decimal(e.amount))),
      new Decimal(0),
    );
    if (!derived.equals(new Decimal(b.balance))) {
      mismatches.push({ userId: b.userId, cached: b.balance, derived: derived.toFixed() });
    }
  }

  if (mismatches.length > 0) {
    await recordAudit({
      action: 'LOCAL_LEDGER_RECONCILIATION_MISMATCH',
      targetType: 'UserCoinBalance',
      targetId: coin,
      detail: `${coin}: ${mismatches.length} mismatch(es) out of ${balances.length} checked.`,
    });
  }
  return { checked: balances.length, mismatches };
}

/** INV-P5 (rev04 §1.4/A-3 §4.4bis). */
export async function reconcileStakePrincipalHolds(
  coin: string,
): Promise<{ holdTotal: string; principalTotal: string; matches: boolean }> {
  const holds = await prisma.localBalanceHold.findMany({
    where: { coin, reasonCode: 'STAKE_PRINCIPAL_LOCK', status: 'ACTIVE' },
    select: { amount: true },
  });
  const holdTotal = holds.reduce((acc, h) => acc.plus(new Decimal(h.amount)), new Decimal(0));

  const positions = await prisma.stakePositionV2.findMany({
    where: { coin, fundingSource: 'USER_BALANCE', status: 'ACTIVE' },
    select: { principal: true },
  });
  const principalTotal = positions.reduce((acc, p) => acc.plus(new Decimal(p.principal)), new Decimal(0));

  const matches = holdTotal.equals(principalTotal);
  if (!matches) {
    await recordAudit({
      action: 'STAKE_PRINCIPAL_HOLD_MISMATCH',
      targetType: 'ReserveVerificationRun',
      targetId: coin,
      detail: `${coin}: stakePrincipalHoldTotal=${holdTotal.toFixed()} activeUserFundedPrincipalTotal=${principalTotal.toFixed()}`,
    });
  }
  return { holdTotal: holdTotal.toFixed(), principalTotal: principalTotal.toFixed(), matches };
}

// ---------------------------------------------------------------------------
// §4.5 — PoR-1″ verification run
// ---------------------------------------------------------------------------

export type ReserveVerificationResultValue = 'PASS' | 'FAIL' | 'INCOMPLETE' | 'QUERY_FAILED' | 'NO_RESERVE_BASIS';

interface PlatformControlledAddressRow {
  id: string;
  coin: string;
  network: string;
  address: string;
}

/**
 * TODO(follow-up task, out of scope here): real on-chain balance query for a
 * PlatformControlledAddress row. Left as a stub — see A-3 §0 "this document does not
 * make" list (on-chain reads are a separate RPC-integration task). Any thrown error
 * here surfaces as ReserveVerificationResult.QUERY_FAILED, never a false PASS.
 */
async function fetchOnchainBalance(addr: PlatformControlledAddressRow): Promise<string> {
  throw new Error(
    `TODO: on-chain balance RPC lookup not implemented yet for ${addr.coin} @ ${addr.network}:${addr.address}`,
  );
}

/**
 * A-3 §4.5 (rev04 PoR-1″). Read-only. Computes and stores one ReserveVerificationRun
 * snapshot. L1 (localLedgerBalanceTotal) and L4 (referralPayableTotal) are always
 * computable from this document's own tables. L2 (unclaimedLedgeredInterestTotal) is
 * computed from UserCoinYieldSummary — computable in this codebase state because the
 * full V2-CORE schema (including A-4's tables) was migrated together in one pass, so
 * A-3's original "A-4 doesn't exist yet, leave L2 null" premise no longer applies;
 * the query is honest ("0" today, 0 rows) rather than an artificially withheld null.
 * L3 (grantPrincipalPayableTotal) follows H-2′: "0" once zero PLATFORM_GRANT
 * positions exist (true today — V2-CORE never creates one, requirement G-E).
 *
 * Right-hand side on-chain balance lookup is a TODO stub (see fetchOnchainBalance) —
 * PoR-G1 (controlledAddressCount === 0 => NO_RESERVE_BASIS, never PASS) is fully
 * implemented and is checked BEFORE any on-chain call, so an empty registry can never
 * produce a false PASS regardless of the stub.
 */
export async function runReserveVerification(
  coin: string,
  trigger: 'WORKER_PERIODIC' | 'MANUAL_ADMIN' | 'PRE_AUTHORITY_TRANSITION' | 'PRE_ISSUANCE_GATE',
) {
  // L1
  const balances = await prisma.userCoinBalance.findMany({ where: { coin }, select: { balance: true } });
  const localLedgerBalanceTotal = balances.reduce((acc, b) => acc.plus(new Decimal(b.balance)), new Decimal(0));

  // L2
  const yieldSummaries = await prisma.userCoinYieldSummary.findMany({
    where: { coin },
    select: { ledgeredYieldTotal: true, claimedYieldTotal: true },
  });
  const unclaimedLedgeredInterestTotal = yieldSummaries.reduce(
    (acc, s) => acc.plus(new Decimal(s.ledgeredYieldTotal).minus(new Decimal(s.claimedYieldTotal))),
    new Decimal(0),
  );

  // L3 — H-2′.
  const grantPositionCount = await prisma.stakePositionV2.count({ where: { coin, fundingSource: 'PLATFORM_GRANT' } });
  const grantPrincipalPayableTotal: Decimal | null = grantPositionCount === 0 ? new Decimal(0) : null;

  // L4
  const referralPayouts = await prisma.referralBonusPayout.findMany({ where: { coin }, select: { total: true } });
  const referralGross = referralPayouts.reduce((acc, r) => acc.plus(new Decimal(r.total)), new Decimal(0));
  const referralCreditedEntries = await prisma.localLedgerEntry.findMany({
    where: { coin, reasonCode: 'REFERRAL_BONUS_CREDIT' },
    select: { amount: true },
  });
  const referralCredited = referralCreditedEntries.reduce((acc, e) => acc.plus(new Decimal(e.amount)), new Decimal(0));
  const referralPayableTotal = referralGross.minus(referralCredited);

  // Display / cross-check only (componentRole SUBSET_OF_LOCAL_BALANCE / TIMING_ADJUSTMENT).
  const activePrincipalPositions = await prisma.stakePositionV2.findMany({
    where: { coin, fundingSource: 'USER_BALANCE', status: 'ACTIVE' },
    select: { principal: true },
  });
  const activeUserFundedPrincipalTotal = activePrincipalPositions.reduce(
    (acc, p) => acc.plus(new Decimal(p.principal)),
    new Decimal(0),
  );

  const stakeHolds = await prisma.localBalanceHold.findMany({
    where: { coin, reasonCode: 'STAKE_PRINCIPAL_LOCK', status: 'ACTIVE' },
    select: { amount: true },
  });
  const stakePrincipalHoldTotal = stakeHolds.reduce((acc, h) => acc.plus(new Decimal(h.amount)), new Decimal(0));

  const withdrawalHolds = await prisma.localBalanceHold.findMany({
    where: { coin, reasonCode: 'WITHDRAWAL_PENDING', status: 'ACTIVE' },
    select: { amount: true },
  });
  const withdrawalPendingHoldTotal = withdrawalHolds.reduce((acc, h) => acc.plus(new Decimal(h.amount)), new Decimal(0));

  const inFlightWithdrawals = await prisma.withdrawalRequest.findMany({
    where: { currency: coin, status: 'AWAITING_ONCHAIN' },
    select: { debitTotal: true },
  });
  const inFlightUnknown = inFlightWithdrawals.some((w) => w.debitTotal == null);
  const inFlightOnchainWithdrawalTotal: Decimal | null = inFlightUnknown
    ? null
    : inFlightWithdrawals.reduce((acc, w) => acc.plus(new Decimal(w.debitTotal as string)), new Decimal(0));

  const lastRun = await prisma.reserveVerificationRun.findFirst({ where: { coin }, orderBy: { ranAt: 'desc' } });
  // PROGRAM_COMMITMENT — admin-entered elsewhere (A-8/A-11); this function only
  // carries the last stored value forward, never computes it (A-3 §4.5).
  const compensationPlanCommitmentTotal = lastRun?.compensationPlanCommitmentTotal ?? null;

  // INV-P5 cross-check.
  const stakeHoldMatchesPrincipal = stakePrincipalHoldTotal.equals(activeUserFundedPrincipalTotal);
  if (!stakeHoldMatchesPrincipal) {
    await recordAudit({
      action: 'STAKE_PRINCIPAL_HOLD_MISMATCH',
      targetType: 'ReserveVerificationRun',
      targetId: coin,
      detail: `${coin}: stakePrincipalHoldTotal=${stakePrincipalHoldTotal.toFixed()} activeUserFundedPrincipalTotal=${activeUserFundedPrincipalTotal.toFixed()}`,
    });
  }

  // Right-hand side.
  const controlledAddresses = await prisma.platformControlledAddress.findMany({ where: { coin, active: true } });
  const controlledAddressCount = controlledAddresses.length;

  let result: ReserveVerificationResultValue;
  let leftTotal: Decimal | null = null;
  let controlledOnchainBalanceTotal = new Decimal(0);
  let marginAmount: Decimal | null = null;
  let breachDetail: string | null = null;
  let blocksIssuance = false;

  if (controlledAddressCount === 0) {
    // PoR-G1 (rev04 §1.7) — checked BEFORE any on-chain call or left-side judgement.
    // "Reserves are zero" and "reserves were never registered" are different facts;
    // this can never resolve to PASS just because the left side also happens to be 0.
    result = 'NO_RESERVE_BASIS';
    blocksIssuance = true;
  } else {
    let onchainQueryFailed = false;
    for (const addr of controlledAddresses) {
      try {
        const bal = await fetchOnchainBalance(addr);
        controlledOnchainBalanceTotal = controlledOnchainBalanceTotal.plus(new Decimal(bal));
      } catch {
        onchainQueryFailed = true;
      }
    }

    if (onchainQueryFailed) {
      result = 'QUERY_FAILED';
    } else if (!stakeHoldMatchesPrincipal) {
      // INV-P5 violation means the left side cannot be trusted — hard FAIL (A-3 §1.4).
      result = 'FAIL';
      breachDetail = 'STAKE_PRINCIPAL_HOLD_MISMATCH (INV-P5) — see AuditLog for the mismatch amounts.';
      blocksIssuance = true;
    } else if (unclaimedLedgeredInterestTotal === null || grantPrincipalPayableTotal === null) {
      // Never substitute "0" for an uncomputable component (A-3 §1 principle 5).
      result = 'INCOMPLETE';
    } else {
      leftTotal = localLedgerBalanceTotal
        .plus(unclaimedLedgeredInterestTotal)
        .plus(grantPrincipalPayableTotal)
        .plus(referralPayableTotal);
      marginAmount = controlledOnchainBalanceTotal.minus(leftTotal);
      if (leftTotal.lte(controlledOnchainBalanceTotal)) {
        result = 'PASS';
      } else {
        result = 'FAIL';
        breachDetail = `leftTotal ${leftTotal.toFixed()} > controlledOnchainBalanceTotal ${controlledOnchainBalanceTotal.toFixed()}`;
        blocksIssuance = true;
      }
    }
  }

  return prisma.reserveVerificationRun.create({
    data: {
      coin,
      trigger,
      localLedgerBalanceTotal: localLedgerBalanceTotal.toFixed(),
      unclaimedLedgeredInterestTotal: unclaimedLedgeredInterestTotal.toFixed(),
      grantPrincipalPayableTotal: grantPrincipalPayableTotal?.toFixed() ?? null,
      referralPayableTotal: referralPayableTotal.toFixed(),
      leftTotal: leftTotal?.toFixed() ?? null,
      activeUserFundedPrincipalTotal: activeUserFundedPrincipalTotal.toFixed(),
      stakePrincipalHoldTotal: stakePrincipalHoldTotal.toFixed(),
      withdrawalPendingHoldTotal: withdrawalPendingHoldTotal.toFixed(),
      inFlightOnchainWithdrawalTotal: inFlightOnchainWithdrawalTotal?.toFixed() ?? null,
      compensationPlanCommitmentTotal,
      controlledAddressCount,
      controlledOnchainBalanceTotal: controlledOnchainBalanceTotal.toFixed(),
      result,
      marginAmount: marginAmount?.toFixed() ?? null,
      breachDetail,
      blocksIssuance,
    },
  });
}

// ---------------------------------------------------------------------------
// §4.6 — assertReserveHealthyOrThrow (PoR-1″ synchronous gate, rev04 PoR-G2)
// ---------------------------------------------------------------------------

export type ReserveGateReason =
  | 'NO_RUN'
  | 'STALE'
  | 'INCOMPLETE'
  | 'FAIL'
  | 'QUERY_FAILED'
  | 'NO_RESERVE_BASIS'
  | 'INSUFFICIENT_MARGIN';

export interface ReserveGateLastRun {
  ranAt: Date;
  result: string;
  marginAmount: string | null;
}

export interface ReserveGateInput {
  porGateEnabled: boolean;
  lastRun: ReserveGateLastRun | null;
  now: Date;
  porGateMaxStalenessMinutes: number;
  amount: string;
}

export type ReserveGateOutcome = { ok: true } | { ok: false; reason: ReserveGateReason };

// NOTE: tsconfig.json sets "strict": false (strictNullChecks off) project-wide, under
// which TypeScript's control-flow narrowing on a discriminated union (`if (!x.ok)`)
// does not reliably narrow away the `{ ok: true }` member — a verified, reproducible
// gap in this exact config, not a hypothetical. A user-defined type-predicate
// function (unlike plain control-flow narrowing) forces the narrowing regardless, so
// every place that branches on a `{ ok: boolean, ... }` result in this codebase
// (localLedger.ts / withdrawalOnchain.ts / onchain/verifyWithdrawal.ts) uses one of
// these instead of a bare `if (!outcome.ok)` + property access.
export function isReserveGateBlocked(o: ReserveGateOutcome): o is Extract<ReserveGateOutcome, { ok: false }> {
  return o.ok === false;
}

/**
 * Pure decision logic (A-3 §4.6 steps 1-7), factored out of assertReserveHealthyOrThrow
 * for direct unit testing without a database — mirrors the harness split used for
 * nia-signing.js/onchain-verify.js elsewhere in this codebase.
 */
export function evaluateReserveGate(input: ReserveGateInput): ReserveGateOutcome {
  // Step 1.
  if (!input.porGateEnabled) return { ok: true };

  // Step 2.
  if (!input.lastRun) return { ok: false, reason: 'NO_RUN' };

  // Step 3.
  const staleMs = input.porGateMaxStalenessMinutes * 60_000;
  if (input.now.getTime() - input.lastRun.ranAt.getTime() > staleMs) return { ok: false, reason: 'STALE' };

  // Step 4 (rev04 PoR-G1) — explicit, even though step 5 below would also catch it
  // (NO_RESERVE_BASIS !== 'PASS'), to keep the mapping traceable to the design doc.
  if (input.lastRun.result === 'NO_RESERVE_BASIS') return { ok: false, reason: 'NO_RESERVE_BASIS' };

  // Step 5.
  if (input.lastRun.result !== 'PASS') {
    return { ok: false, reason: input.lastRun.result as ReserveGateReason };
  }

  // Step 6 (rev04 PoR-G2) — amount vs. the last run's margin, inside the freshness window.
  if (input.lastRun.marginAmount == null || new Decimal(input.amount).gt(new Decimal(input.lastRun.marginAmount))) {
    return { ok: false, reason: 'INSUFFICIENT_MARGIN' };
  }

  // Step 7.
  return { ok: true };
}

export interface ReserveGateBlockedDetail {
  coin: string;
  amount: string;
  reason: ReserveGateReason;
  lastRun?: unknown;
}

export class ReserveGateBlockedError extends Error {
  readonly detail: ReserveGateBlockedDetail;
  constructor(detail: ReserveGateBlockedDetail) {
    super(`${detail.coin}: PoR-1″ reserve gate blocked issuance of ${detail.amount} (${detail.reason}).`);
    this.name = 'ReserveGateBlockedError';
    this.detail = detail;
  }
}

/**
 * A-3 §4.6 (rev04 PoR-G2 signature — `amount` is required). Preventive control: reads
 * the freshest ReserveVerificationRun (populated by the periodic worker, not queried
 * on-chain synchronously here — see §4.6 closing note on "light" vs. "heavy" gating)
 * and throws ReserveGateBlockedError unless every step passes. Never mutates
 * anything — read-only.
 */
export async function assertReserveHealthyOrThrow(coin: string, amount: string): Promise<void> {
  const settings = await getPlatformSettings();
  if (!settings.porGateEnabled) return;

  const lastRun = await prisma.reserveVerificationRun.findFirst({ where: { coin }, orderBy: { ranAt: 'desc' } });
  const outcome = evaluateReserveGate({
    porGateEnabled: settings.porGateEnabled,
    lastRun: lastRun ? { ranAt: lastRun.ranAt, result: lastRun.result, marginAmount: lastRun.marginAmount } : null,
    now: new Date(),
    porGateMaxStalenessMinutes: settings.porGateMaxStalenessMinutes,
    amount,
  });

  if (isReserveGateBlocked(outcome)) {
    throw new ReserveGateBlockedError({ coin, amount, reason: outcome.reason, lastRun: lastRun ?? undefined });
  }
}
