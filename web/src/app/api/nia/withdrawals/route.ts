export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { niaWalletRequest } from '@/lib/nia/client';
import { resolveSessionUserId } from '@/lib/nia/resolve';
import { niaState } from '@/lib/nia/state';
import { ok, fail } from '@/lib/nia/respond';
import { getPlatformSettings } from '@/lib/platformSettings';
import { forwardWithdrawalToHub } from '@/lib/withdrawals';
import { settleMaturedPositions, lockedPrincipalByCoin } from '@/lib/staking';
import { getCoinAuthority, assertExecutionAllowed, CoinAuthorityBlockedError } from '@/lib/coinAuthority';
import { createLocalWithdrawalHold } from '@/lib/withdrawalOnchain';
import { getUserCoinBalance } from '@/lib/localLedger';

// Stablecoins are valued 1:1 with USD for the auto-approve threshold. Any other
// asset can't be valued safely here, so it always requires manual approval.
const STABLECOINS = new Set(['USDT', 'USDC', 'USD1', 'FDUSD', 'RLUSD', 'DAI', 'USD']);

// G2 guardrail (C2): anonymous, aggregate-only occurrence tripwire for withdrawal
// rejections caused specifically by the staking soft-lock (not other rejection
// reasons — invalid address, insufficient total balance, etc. do not call this).
// Mandated by docs/specs/oil-drilling-staking-game-exposure-instrumentation-ruling.md
// §3 (C2) and standing rules #7/#8. This is a structured log emission, not a DB
// write — the ruling explicitly forbids any new table/column/Prisma model for it
// ("Not persisted to the database" — §3 constraint 4). Aggregation into a daily/coin
// rate happens downstream, on the log stream, by whoever analyzes it — never by a
// query against application data, and never surfaced to any UI.
//
// Emits exactly three fields, no more: event key, UTC day bucket (not a per-request
// timestamp), and coin. No userId, niaUserId, email, session id, IP, request id, or
// any hash/derivative of them may ever be added to this payload — doing so would
// re-enter the review this ruling closed (§3 constraint 1-2, standing rule #8).
function logStakingLockBlockEvent(coin: string): void {
  console.log(JSON.stringify({
    event: 'staking_lock_withdrawal_blocked',
    day: new Date().toISOString().slice(0, 10), // UTC yyyy-mm-dd bucket only
    coin,
  }));
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  try {
    const userId = await resolveSessionUserId();
    const data = await niaWalletRequest('GET', '/api/v1/withdrawals', {
      query: {
        userId,
        currency: sp.get('currency') ?? undefined,
        page: sp.get('page') ?? undefined,
        limit: sp.get('limit') ?? undefined,
      },
    }) as { items?: unknown[] } | unknown[] | null;

    // Merge in the user's locally-held requests, authority-aware (A-5 §1.8):
    //  - HUB rail: only requests not yet visible in the hub's own history
    //    (PENDING / PROCESSING / REJECTED / FAILED). APPROVED HUB requests
    //    already show up from the hub call above — unchanged from before.
    //  - LOCAL rail: the local WithdrawalRequest row is the ONLY source of
    //    truth (there is no hub call for this rail at all) — every status
    //    must be merged, including AWAITING_ONCHAIN and APPROVED, or the
    //    request disappears from the user's history the moment an admin
    //    approves it (and never reappears once settled). See the design doc's
    //    "regression" writeup for why this must ship in the same release as
    //    the admin submit-tx endpoint.
    let localItems: unknown[] = [];
    try {
      const session = await auth();
      const dbUserId = (session?.user as { id?: string } | undefined)?.id;
      if (dbUserId) {
        const reqs = await prisma.withdrawalRequest.findMany({
          where: {
            userId: dbUserId,
            OR: [
              { balanceAuthorityAtRequest: 'HUB', status: { in: ['PENDING', 'PROCESSING', 'REJECTED', 'FAILED'] } },
              { balanceAuthorityAtRequest: 'LOCAL' },
            ],
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        });
        localItems = reqs.map((w) => ({
          id: w.id,
          amount: w.amount,
          currency: w.currency,
          network: w.network,
          toAddress: w.toAddress,
          status: w.status,
          txHash: w.hubTxId ?? null,
          // LOCAL rail (A-5) — the on-chain settlement info. An
          // AWAITING_ONCHAIN row with no onchainVerifiedAt yet has only an
          // unverified admin claim (if any submit-tx attempt was made) —
          // the frontend (ActivityHistory) is responsible for not rendering
          // a hash until onchainVerifiedAt is set (W-4).
          onchainTxHash: w.onchainTxHash ?? null,
          onchainVerifiedAt: w.onchainVerifiedAt ?? null,
          createdAt: w.createdAt,
          pendingApproval: w.status === 'PENDING',
        }));
      }
    } catch { /* local merge is best-effort; never break the hub history */ }

    const hubItems = Array.isArray(data) ? data : (data?.items ?? []);
    const merged = { ...(Array.isArray(data) ? {} : data), items: [...localItems, ...hubItems] };
    return ok(merged);
  } catch (e) {
    return fail(e as Error & { status?: number; data?: { code?: unknown } });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }

  // -- 1. Derive identity exclusively from session — never from client input --
  let niaUserId: string;
  let dbUserId: string;
  let email: string;
  try {
    niaUserId = await resolveSessionUserId();
    const session = await auth();
    const u = session?.user as { id?: string; email?: string } | undefined;
    if (!u?.id) throw Object.assign(new Error('Unauthorized'), { status: 401 });
    dbUserId = u.id;
    email = u.email ?? '';
  } catch (e) {
    return fail(e as Error & { status?: number; data?: { code?: unknown } });
  }

  // -- Safety hold: withdrawals are paused for 24h after an email change --
  try {
    const u = await prisma.user.findUnique({ where: { id: dbUserId }, select: { emailChangedAt: true } });
    if (u?.emailChangedAt) {
      const elapsed = Date.now() - u.emailChangedAt.getTime();
      const windowMs = 24 * 60 * 60 * 1000;
      if (elapsed < windowMs) {
        const hrs = Math.ceil((windowMs - elapsed) / (60 * 60 * 1000));
        return NextResponse.json(
          { ok: false, error: `Withdrawals are paused for ${hrs}h after an email change, to protect your assets.` },
          { status: 403 },
        );
      }
    }
  } catch { /* fail-open: don't block on a transient lookup error */ }

  const { currency, network, toAddress, amount } = body as {
    currency?: string;
    network?: string;
    toAddress?: string;
    amount?: unknown;
  };

  // -- 2. Validate toAddress --
  if (!toAddress || typeof toAddress !== 'string' || toAddress.trim() === '') {
    return NextResponse.json(
      { ok: false, error: 'toAddress is required' },
      { status: 400 },
    );
  }

  // -- 3. Validate amount with decimal.js (never Number/parseFloat for money) --
  let decAmount: Decimal;
  try {
    decAmount = new Decimal(amount as string | number);
    if (!decAmount.isFinite() || !decAmount.gt(0)) throw new Error('out-of-range');
  } catch {
    return NextResponse.json(
      { ok: false, error: 'amount must be a finite positive number' },
      { status: 400 },
    );
  }

  // -- 3b. Platform withdrawal policy --
  const policy = await getPlatformSettings().catch(() => null);

  // Maintenance mode: all withdrawals paused.
  if (policy?.maintenanceMode) {
    return NextResponse.json(
      { ok: false, error: 'Withdrawals are temporarily paused for maintenance. Please try again later.' },
      { status: 503 },
    );
  }

  // Whitelist-only: the destination must be in the user's saved address book.
  if (policy?.whitelistOnly) {
    const saved = await prisma.withdrawalAddress.findFirst({
      where: { userId: dbUserId, network: String(network ?? ''), address: toAddress.trim() },
      select: { id: true },
    });
    if (!saved) {
      return NextResponse.json(
        { ok: false, error: 'For your security, withdrawals are only allowed to addresses saved in your address book. Add this address in Settings first.' },
        { status: 403 },
      );
    }
  }

  // Daily withdrawal limit (per user, rolling 24h, USD). Only valued (stablecoin)
  // withdrawals count toward and are checked against the cap.
  const curUpper = String(currency ?? '').toUpperCase();
  if (policy?.dailyWithdrawalLimitUsd && STABLECOINS.has(curUpper)) {
    const limit = new Decimal(policy.dailyWithdrawalLimitUsd);
    if (limit.gt(0)) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recent = await prisma.withdrawalRequest.findMany({
        where: { userId: dbUserId, createdAt: { gte: since }, status: { in: ['PENDING', 'APPROVED'] } },
        select: { currency: true, amount: true },
      });
      let used = new Decimal(0);
      for (const w of recent) {
        if (STABLECOINS.has(w.currency.toUpperCase())) used = used.plus(new Decimal(w.amount));
      }
      if (used.plus(decAmount).gt(limit)) {
        return NextResponse.json(
          { ok: false, error: `Daily withdrawal limit reached (max $${limit.toFixed()} per 24h). You've used $${used.toFixed()}.` },
          { status: 403 },
        );
      }
    }
  }

  // -- 3b′. LOCAL-authority coins (A-2 CoinBalanceAuthority) never have a hub
  // balance to check against — branch out to the LOCAL rail entirely here,
  // before the HUB-only balance check below. W-1 (unconditional balance
  // verification) still applies on this rail: createLocalWithdrawalHold's
  // placeHold() (A-3 §4.3) checks getUserCoinBalance().available inside the
  // SAME DB transaction as the WithdrawalRequest row creation and always
  // throws INSUFFICIENT_AVAILABLE_BALANCE if the amount exceeds it — there
  // is no conditional/opt-out path, mirroring the HUB-rail W-1 fix below.
  let authority: 'HUB' | 'LOCAL' = 'HUB';
  try {
    authority = await getCoinAuthority(curUpper);
  } catch {
    // Fail open to HUB here only decides "which rail" — getCoinAuthority()
    // itself already treats a missing/unreadable ManagedCoin row as HUB (its
    // own documented default, A-2 §4.1). A genuine DB outage lands here too;
    // the HUB balance check below (3c) is unconditional and fails CLOSED on
    // its own hub-lookup failure, so this fallback never bypasses balance
    // verification — it only ever routes into the (still-verified) HUB path.
  }

  if (authority === 'LOCAL') {
    try {
      await assertExecutionAllowed(curUpper, 'WITHDRAWAL');
    } catch (e) {
      if (e instanceof CoinAuthorityBlockedError) {
        return NextResponse.json({ ok: false, error: e.message }, { status: 403 });
      }
      throw e;
    }

    const localClientKey = req.headers.get('Idempotency-Key');
    const localInflightKey = localClientKey
      ? `idem:${localClientKey}`
      : `${dbUserId}|${curUpper}|${network}|${toAddress.trim()}|${decAmount.toFixed()}`;

    if (niaState.inFlightWithdrawals.has(localInflightKey)) {
      return NextResponse.json(
        { ok: false, error: 'A duplicate withdrawal is already in progress' },
        { status: 409 },
      );
    }

    niaState.inFlightWithdrawals.add(localInflightKey);
    try {
      // -- LOCAL rail hold: request row + WITHDRAWAL_PENDING hold, atomic
      //    (A-5 §3.2). No hub call, no auto-approve (W-8 — LOCAL never
      //    auto-approves; "approved" on this rail only means "queued for
      //    manual on-chain execution", see approve-route + submit-tx). --
      const wr = await createLocalWithdrawalHold({
        userId: dbUserId,
        niaUserId,
        email,
        coin: curUpper,
        network: String(network ?? ''),
        toAddress: toAddress.trim(),
        amount: decAmount.toFixed(),
        // W-7 (admin-configurable fee) has no data home yet — explicitly
        // deferred to coin-management-screen work (A-5 §5/§6-10). "0" is
        // honest here, not a placeholder guess: no fee config exists
        // anywhere in this codebase yet to compute a nonzero value from.
        feeAmount: '0',
      });
      return NextResponse.json({ ok: true, data: { id: wr.id, status: 'PENDING', pendingApproval: true } });
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === 'INSUFFICIENT_AVAILABLE_BALANCE') {
        const bal = await getUserCoinBalance(dbUserId, curUpper).catch(() => null);
        return NextResponse.json(
          { ok: false, error: `Insufficient balance. You have ${bal?.available ?? '0'} ${curUpper} available to withdraw.` },
          { status: 400 },
        );
      }
      console.error('[withdrawals] local create error:', e);
      return NextResponse.json(
        { ok: false, error: 'Withdrawal service unavailable. Please try again later.' },
        { status: 503 },
      );
    } finally {
      niaState.inFlightWithdrawals.delete(localInflightKey);
    }
  }

  // -- 3c. Available-balance check: request amount must not exceed the user's
  // hub balance minus any principal locked in active stakes. This runs
  // UNCONDITIONALLY — even when locked == 0 — because niaBal itself is the
  // hub's balance of record; skipping this check whenever there's no staking
  // lock would let any amount through with no balance verification at all (W-1).
  // Reading the local stake state is best-effort (treat a transient local-DB
  // error as "no lock"). But verifying against the hub balance is NOT optional:
  // if we can't fetch it we must FAIL CLOSED rather than risk an unverified
  // withdrawal being queued.
  let locked = new Decimal(0);
  try {
    await settleMaturedPositions(dbUserId);
    locked = (await lockedPrincipalByCoin(dbUserId)).get(curUpper) ?? new Decimal(0);
  } catch { /* local stake lookup best-effort */ }

  let niaBal: Decimal;
  try {
    const raw = await niaWalletRequest('GET', '/api/v1/wallets', { query: { userId: niaUserId, currency: String(currency ?? '') } });
    const rows: unknown[] = Array.isArray(raw)
      ? raw
      : raw && typeof raw === 'object'
        ? Object.values(raw as Record<string, unknown>).flatMap((v) => (Array.isArray(v) ? v : []))
        : [];
    niaBal = new Decimal(0);
    for (const r of rows as Array<{ currency?: string; balance?: string }>) {
      if ((r?.currency ?? '').toUpperCase() === curUpper) niaBal = niaBal.plus(new Decimal(r.balance ?? '0'));
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Could not verify your available balance right now. Please try again shortly.' },
      { status: 503 },
    );
  }
  const available = niaBal.minus(locked);
  if (decAmount.gt(available)) {
    if (locked.gt(0)) {
      // -- G2 guardrail tripwire (C2) --
      // Anonymous, aggregate-only occurrence counter for "withdrawal blocked because
      // principal is locked in staking." Required by the binding ruling in
      // docs/specs/oil-drilling-staking-game-exposure-instrumentation-ruling.md §3.
      // BINDING CONSTRAINTS (do not add fields without re-reading that doc):
      //   - No userId / niaUserId / email / session id / IP / hash-of-any-of-those.
      //   - No correlation/request/trace id.
      //   - No dedup, no unique-user counting — a raw occurrence emission only.
      //   - NOT persisted to the database. No table, no column, no Prisma model.
      //   - Fields limited to: day bucket, event key, coin. Nothing else.
      //   - Never read back into any UI (not user-facing, not admin-facing).
      logStakingLockBlockEvent(curUpper);
      return NextResponse.json(
        { ok: false, error: `${locked.toFixed()} ${curUpper} is locked in staking. You have ${Decimal.max(0, available).toFixed()} ${curUpper} available to withdraw.` },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: `Insufficient balance. You have ${Decimal.max(0, available).toFixed()} ${curUpper} available to withdraw.` },
      { status: 400 },
    );
  }

  // -- 4. In-flight dedup guard (prevents concurrent duplicate submissions) --
  const clientKey = req.headers.get('Idempotency-Key');
  const inflightKey = clientKey
    ? `idem:${clientKey}`
    : `${niaUserId}|${currency}|${network}|${toAddress.trim()}|${decAmount.toFixed()}`;

  if (niaState.inFlightWithdrawals.has(inflightKey)) {
    return NextResponse.json(
      { ok: false, error: 'A duplicate withdrawal is already in progress' },
      { status: 409 },
    );
  }

  niaState.inFlightWithdrawals.add(inflightKey);
  try {
    // -- 5. Hold for admin approval — do NOT forward to the hub yet. The funds
    //       only leave once an admin APPROVES (which forwards it then). --
    const wr = await prisma.withdrawalRequest.create({
      data: {
        userId: dbUserId,
        niaUserId,
        email,
        currency: String(currency ?? ''),
        network: String(network ?? ''),
        amount: decAmount.toFixed(), // canonical string, no float drift
        toAddress: toAddress.trim(),
        idempotencyKey: clientKey ?? null,
        status: 'PENDING',
      },
    });

    // -- 6. Auto-approve small withdrawals if policy allows. Only stablecoins can
    //       be valued safely here; anything else always goes to manual review. --
    const cur = String(currency ?? '').toUpperCase();
    const usdValue = STABLECOINS.has(cur) ? decAmount : null;
    const threshold = policy?.autoApproveUnderUsd ? new Decimal(policy.autoApproveUnderUsd) : null;
    if (threshold && threshold.gt(0) && usdValue && usdValue.lte(threshold)) {
      // Atomically claim before forwarding (same double-forward guard as the
      // admin approve path). Only forward if we won the PENDING -> PROCESSING flip.
      const claim = await prisma.withdrawalRequest.updateMany({
        where: { id: wr.id, status: 'PENDING' },
        data: { status: 'PROCESSING' },
      });
      if (claim.count === 1) {
        const result = await forwardWithdrawalToHub(wr);
        if (result.ok) {
          return NextResponse.json({ ok: true, data: { id: wr.id, status: 'APPROVED', autoApproved: true } });
        }
        // On error the helper marks it FAILED (needs manual verification on the
        // hub). Signal FAILED distinctly — it is NOT "pending admin approval".
        return NextResponse.json({ ok: true, data: { id: wr.id, status: 'FAILED', failed: true } });
      }
    }

    return NextResponse.json({ ok: true, data: { id: wr.id, status: 'PENDING', pendingApproval: true } });
  } catch (e) {
    console.error('[withdrawals] create error:', e);
    return NextResponse.json(
      { ok: false, error: 'Withdrawal service unavailable. Please try again later.' },
      { status: 503 },
    );
  } finally {
    niaState.inFlightWithdrawals.delete(inflightKey);
  }
}
