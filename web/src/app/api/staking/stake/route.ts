export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { niaWalletRequest } from '@/lib/nia/client';
import { resolveSessionUserId } from '@/lib/nia/resolve';
import { settleMaturedPositions } from '@/lib/staking';
import { DAY_MS } from '@/lib/stakingMath';
import { AUTO_RENEW_MAX_TERM_DAYS } from '@/lib/stakingRenew';

// docs/specs/staking-page-v2-screen-flow-frd.md §7.1 R-D5 / §7.2 — every
// staking route must return a stable `code` so the client can render a
// localized `staking.error.<code>` string instead of this raw English
// message (which stays in the body for logging/debugging only — S-STAKE
// never shows it directly, per T-7/AC-19). `params` carries the few
// dynamic values (min/max/available + coin) some codes need.
function err(e: unknown) {
  const x = e as Error & { status?: number; code?: string; params?: Record<string, string> };
  return NextResponse.json(
    { ok: false, error: x.message, code: x.code ?? 'GENERIC', ...(x.params ? { params: x.params } : {}) },
    { status: x.status ?? 500 },
  );
}

// Sum the available (free) balance for a coin from a Nia /wallets response.
function sumBalance(raw: unknown, coin: string): Decimal {
  const rows: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? Object.values(raw as Record<string, unknown>).flatMap((v) => (Array.isArray(v) ? v : []))
      : [];
  let total = new Decimal(0);
  for (const r of rows as Array<{ currency?: string; balance?: string }>) {
    if ((r?.currency ?? '').toUpperCase() === coin.toUpperCase()) total = total.plus(new Decimal(r.balance ?? '0'));
  }
  return total;
}

// POST /api/staking/stake — lock funds into a staking product.
//
// docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md §2.2
// CS-1′: this v1 execution route is fail-closed and ALWAYS returns 503
// STAKE_PATH_MIGRATING, unconditionally (not gated on product status/coin/
// amount). PoR's `activeUserFundedPrincipalTotal` (web/src/lib/localLedger.ts)
// only reads `StakePositionV2`, so any position created through this v1 route
// is invisible debt to reserve accounting. Entry-point rejection only — the
// pre-CS-1′ implementation below is intentionally left in place (unreachable)
// as the basis for the eventual V2 replacement, kept until CUT-3/CUT-4.
export async function POST(_req: Request): Promise<NextResponse> {
  try { await requireUser(); } catch (e) {
    return err(Object.assign(e as Error, { code: (e as { code?: string }).code ?? 'UNAUTHENTICATED' }));
  }

  return NextResponse.json(
    { ok: false, error: 'The staking execution path is being migrated. Please try again later.', code: 'STAKE_PATH_MIGRATING' },
    { status: 503 },
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _legacyStakeUnreachable(req: Request): Promise<NextResponse> {
  let niaUserId: string, dbUserId: string, email: string;
  try {
    await requireUser();
    niaUserId = await resolveSessionUserId();
    const u = (await auth())?.user as { id?: string; email?: string } | undefined;
    if (!u?.id) throw Object.assign(new Error('Unauthorized'), { status: 401 });
    dbUserId = u.id; email = u.email ?? '';
  } catch (e) { return err(Object.assign(e as Error, { code: (e as { code?: string }).code ?? 'UNAUTHENTICATED' })); }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}
  const productId = String(body.productId ?? '');

  let amount: Decimal;
  try {
    amount = new Decimal(String(body.amount ?? ''));
    if (!amount.isFinite() || amount.lte(0)) throw new Error('bad');
  } catch {
    return NextResponse.json({ ok: false, error: 'Enter a valid amount greater than 0', code: 'STAKE_INVALID_AMOUNT' }, { status: 400 });
  }

  const product = await prisma.stakingProduct.findUnique({ where: { id: productId } });
  if (!product) return NextResponse.json({ ok: false, error: 'Staking product not found', code: 'STAKE_PRODUCT_NOT_FOUND' }, { status: 404 });
  if (product.status !== 'OPEN') {
    return NextResponse.json({ ok: false, error: 'This staking product is closed.', code: 'STAKE_PRODUCT_CLOSED' }, { status: 409 });
  }

  // Auto-renew rider (PRD §4 S1) — optional, defaults false. Never rejects the
  // stake itself over this field: any non-boolean coerces to false, and
  // requesting it on a product over the cap ALSO coerces to false rather than
  // failing the stake (R-2 defensive re-check — the UI never offers this
  // combination since S1 hides the control on those products).
  const autoRenew = body.autoRenew === true && product.termDays <= AUTO_RENEW_MAX_TERM_DAYS;

  // Per-stake min / max.
  if (product.minAmount && amount.lt(new Decimal(product.minAmount))) {
    return NextResponse.json(
      { ok: false, error: `Minimum stake is ${product.minAmount} ${product.coin}.`, code: 'STAKE_BELOW_MIN', params: { min: product.minAmount, coin: product.coin } },
      { status: 400 },
    );
  }
  if (product.maxAmount && amount.gt(new Decimal(product.maxAmount))) {
    return NextResponse.json(
      { ok: false, error: `Maximum stake is ${product.maxAmount} ${product.coin}.`, code: 'STAKE_ABOVE_MAX', params: { max: product.maxAmount, coin: product.coin } },
      { status: 400 },
    );
  }

  // Fetch the user's free balance from Nia (external I/O — kept OUTSIDE the DB
  // transaction below so we don't hold the row locks during a network call).
  // Staking never changes this number; only deposits/withdrawals do, so reading
  // it just before taking the lock is safe.
  await settleMaturedPositions(dbUserId);
  let niaBal: Decimal;
  try {
    const raw = await niaWalletRequest('GET', '/api/v1/wallets', { query: { userId: niaUserId, currency: product.coin } });
    niaBal = sumBalance(raw, product.coin);
  } catch (e) { return err(e); }

  const startAt = new Date();
  const maturityAt = new Date(startAt.getTime() + product.termDays * DAY_MS);

  // Capacity re-check + available-balance re-check + position creation run in ONE
  // transaction, guarded by Postgres advisory locks (product first, then user —
  // a consistent lock order avoids deadlock). Without this, two concurrent stake
  // requests could both read the same available balance / capacity and each
  // create a position, locking more principal than the user actually holds (and
  // then accruing daily interest on funds that aren't there). Serializing per
  // user (balance) and per product (capacity) closes that race.
  let position: { id: string };
  try {
    position = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`stake_product:${product.id}`}, 0))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`stake_user:${dbUserId}`}, 0))`;

      if (product.capacity) {
        const active = await tx.stakePosition.findMany({
          where: { productId, status: 'ACTIVE' }, select: { principal: true },
        });
        const used = active.reduce((s, p) => s.plus(new Decimal(p.principal)), new Decimal(0));
        if (used.plus(amount).gt(new Decimal(product.capacity))) {
          const left = Decimal.max(0, new Decimal(product.capacity).minus(used));
          throw Object.assign(
            new Error(`Not enough capacity left in this product (only ${left.toFixed()} ${product.coin} available).`),
            { status: 409, code: 'STAKE_PRODUCT_FULL', params: { left: left.toFixed(), coin: product.coin } },
          );
        }
      }

      const lockedRows = await tx.stakePosition.findMany({
        where: { userId: dbUserId, status: 'ACTIVE', coin: product.coin }, select: { principal: true },
      });
      const locked = lockedRows.reduce((s, p) => s.plus(new Decimal(p.principal)), new Decimal(0));
      const available = niaBal.minus(locked);
      if (amount.gt(available)) {
        throw Object.assign(
          new Error(`Not enough available ${product.coin}. You have ${Decimal.max(0, available).toFixed()} free to stake.`),
          { status: 400, code: 'STAKE_INSUFFICIENT_AVAILABLE', params: { available: Decimal.max(0, available).toFixed(), coin: product.coin } },
        );
      }

      return tx.stakePosition.create({
        data: {
          userId: dbUserId, niaUserId, email, productId: product.id, coin: product.coin,
          principal: amount.toFixed(), dailyRatePct: product.dailyRatePct, termDays: product.termDays,
          startAt, maturityAt, autoRenew,
        },
        select: { id: true },
      });
    });
  } catch (e) { return err(e); }

  return NextResponse.json({ ok: true, data: { id: position.id, maturityAt: maturityAt.toISOString() } });
}
