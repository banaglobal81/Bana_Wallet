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

// Stablecoins are valued 1:1 with USD for the auto-approve threshold. Any other
// asset can't be valued safely here, so it always requires manual approval.
const STABLECOINS = new Set(['USDT', 'USDC', 'USD1', 'FDUSD', 'RLUSD', 'DAI', 'USD']);

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

    // Merge in the user's locally-held requests that aren't in the hub yet
    // (PENDING / REJECTED / FAILED). APPROVED ones already show up from the hub.
    let localItems: unknown[] = [];
    try {
      const session = await auth();
      const dbUserId = (session?.user as { id?: string } | undefined)?.id;
      if (dbUserId) {
        const reqs = await prisma.withdrawalRequest.findMany({
          where: { userId: dbUserId, status: { in: ['PENDING', 'REJECTED', 'FAILED'] } },
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

  // -- 3c. Staking lock: principal locked in active stakes is non-withdrawable --
  try {
    await settleMaturedPositions(dbUserId);
    const locked = (await lockedPrincipalByCoin(dbUserId)).get(curUpper) ?? new Decimal(0);
    if (locked.gt(0)) {
      const raw = await niaWalletRequest('GET', '/api/v1/wallets', { query: { userId: niaUserId, currency: String(currency ?? '') } });
      const rows: unknown[] = Array.isArray(raw)
        ? raw
        : raw && typeof raw === 'object'
          ? Object.values(raw as Record<string, unknown>).flatMap((v) => (Array.isArray(v) ? v : []))
          : [];
      let niaBal = new Decimal(0);
      for (const r of rows as Array<{ currency?: string; balance?: string }>) {
        if ((r?.currency ?? '').toUpperCase() === curUpper) niaBal = niaBal.plus(new Decimal(r.balance ?? '0'));
      }
      const available = niaBal.minus(locked);
      if (decAmount.gt(available)) {
        return NextResponse.json(
          { ok: false, error: `${locked.toFixed()} ${curUpper} is locked in staking. You have ${Decimal.max(0, available).toFixed()} ${curUpper} available to withdraw.` },
          { status: 400 },
        );
      }
    }
  } catch { /* best-effort — Nia still enforces its own balance check downstream */ }

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
      const result = await forwardWithdrawalToHub(wr);
      if (result.ok) {
        return NextResponse.json({ ok: true, data: { id: wr.id, status: 'APPROVED', autoApproved: true } });
      }
      // Hub rejected — leave it PENDING for manual review (lastError recorded).
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
