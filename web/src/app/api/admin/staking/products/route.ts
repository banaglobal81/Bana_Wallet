export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit';
import { aprPct } from '@/lib/stakingMath';
import { isFirstTrancheTermDays, isValidStakingTermDays, STAKING_TERM_LADDER_DAYS } from '@/lib/stakingProductAdmin';

// docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md §5.1 CUT-2 /
// T-5: this route (and products/[id]/route.ts) now target StakingProductV2, not the
// legacy v1 StakingProduct. CP-5′/CP-6/CP-10 are enforced here + in [id]/route.ts.

function adminErr(e: unknown) {
  const err = e as Error & { status?: number; code?: string; params?: Record<string, string> };
  return NextResponse.json({ ok: false, error: err.message, code: err.code, params: err.params }, { status: err.status ?? 500 });
}
function fail(message: string, code: string, status: number, params?: Record<string, string>): never {
  throw Object.assign(new Error(message), { code, status, params });
}

// Parse a REQUIRED positive-or-zero decimal money string (CP-5′: minAmount / maxAmount
// / capacity / baseDailyRatePct are all "non-null 필수" at creation — unlike the v1
// route, null/'' is a validation error here, not a pass-through null).
function parseRequiredMoney(v: unknown, field: string, code: string): string {
  if (v === undefined || v === null || String(v).trim() === '') {
    fail(`${field} is required.`, code, 400);
  }
  const d = new Decimal(String(v));
  if (!d.isFinite() || d.lt(0)) fail(`${field} must be a non-negative number.`, code, 400);
  return d.toFixed();
}

// GET /api/admin/staking/products — all V2 products with staked totals + counts.
export async function GET(): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (e) { return adminErr(e); }

  const products = await prisma.stakingProductV2.findMany({ orderBy: { createdAt: 'desc' } });
  const active = await prisma.stakePositionV2.findMany({
    where: { status: 'ACTIVE' },
    select: { productId: true, principal: true, autoRenew: true },
  });
  const totals = new Map<string, { staked: Decimal; count: number; autoRenewCount: number }>();
  for (const p of active) {
    const t = totals.get(p.productId) ?? { staked: new Decimal(0), count: 0, autoRenewCount: 0 };
    t.staked = t.staked.plus(new Decimal(p.principal));
    t.count += 1;
    if (p.autoRenew) t.autoRenewCount += 1;
    totals.set(p.productId, t);
  }

  const data = products.map((p) => {
    const t = totals.get(p.id);
    return {
      id: p.id, coin: p.coin, name: p.name, termDays: p.termDays,
      baseDailyRatePct: p.baseDailyRatePct, aprPct: aprPct(p.baseDailyRatePct).toFixed(2),
      maxBonusPctOfBase: p.maxBonusPctOfBase,
      minAmount: p.minAmount, maxAmount: p.maxAmount, capacity: p.capacity,
      status: p.status, createdAt: p.createdAt.toISOString(),
      totalStaked: (t?.staked ?? new Decimal(0)).toFixed(), positionCount: t?.count ?? 0,
      autoRenewActiveCount: t?.autoRenewCount ?? 0,
    };
  });
  return NextResponse.json({ ok: true, data });
}

// POST /api/admin/staking/products — create a new StakingProductV2 row. Always
// created CLOSED (CP-5′/§10-24) — opening is a separate CP-6 action on
// products/[id]/route.ts's PATCH.
export async function POST(req: Request): Promise<NextResponse> {
  let admin;
  try { admin = await requireAdmin(); } catch (e) { return adminErr(e); }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}

  try {
    const coin = String(body.coin ?? '').trim().toUpperCase();
    const name = String(body.name ?? '').trim();
    const termDays = Number(body.termDays);

    if (!coin) fail('Coin is required', 'STAKE_PRODUCT_COIN_REQUIRED', 400);
    // Policy: only the BANA token is stakeable (N-6).
    if (coin !== 'BANA') fail('Only BANA staking is supported.', 'STAKE_PRODUCT_COIN_UNSUPPORTED', 400);
    if (!name) fail('Name is required', 'STAKE_PRODUCT_NAME_REQUIRED', 400);
    if (!isValidStakingTermDays(termDays)) {
      fail(
        `Term (days) must be one of: ${STAKING_TERM_LADDER_DAYS.join(', ')}.`,
        'STAKE_PRODUCT_TERM_INVALID',
        400,
      );
    }

    // rev05 §4.3 CP-5′ field table — non-null required for all four, even though
    // baseDailyRatePct may be "0" (§4.3 ⓑ — 180/360-day placeholder rows). Only the
    // CLOSED→OPEN transition (CP-6, products/[id]/route.ts) requires rate > 0.
    const rateRaw = String(body.baseDailyRatePct ?? '').trim();
    if (rateRaw === '') fail('Daily rate is required.', 'STAKE_PRODUCT_RATE_REQUIRED', 400);
    const rate = new Decimal(rateRaw);
    if (!rate.isFinite() || rate.lt(0)) fail('Daily rate must be zero or a positive number.', 'STAKE_PRODUCT_RATE_INVALID', 400);
    const baseDailyRatePct = rate.toFixed();

    const minAmount = parseRequiredMoney(body.minAmount, 'Minimum stake', 'STAKE_PRODUCT_MIN_REQUIRED');
    const maxAmount = parseRequiredMoney(body.maxAmount, 'Maximum stake', 'STAKE_PRODUCT_MAX_REQUIRED');
    if (new Decimal(maxAmount).lt(new Decimal(minAmount))) {
      fail('Maximum stake cannot be less than the minimum stake.', 'STAKE_PRODUCT_MAX_BELOW_MIN', 400);
    }
    const capacity = parseRequiredMoney(body.capacity, 'Capacity', 'STAKE_PRODUCT_CAPACITY_REQUIRED');

    // CP-7′ (rev05 §4.5, qa-lead FAIL → route-enforced) — the "double lock": a
    // 180/360-day row is on the ladder (§4.2) but is NOT part of the first
    // tranche, so its capacity AND rate must be exactly "0" at creation. Rejected
    // outright (never silently coerced to "0") so a caller who typed a real
    // value finds out immediately, not after a confusing later OPEN failure.
    if (!isFirstTrancheTermDays(termDays)) {
      if (!rate.eq(0) || !new Decimal(capacity).eq(0)) {
        fail(
          `${termDays}-day products are not part of the first tranche yet (CP-7′) — capacity and daily rate must both be "0" until that changes.`,
          'STAKE_PRODUCT_TERM_NOT_FIRST_TRANCHE',
          400,
          { termDays: String(termDays) },
        );
      }
    }

    // V2-BAND gate (AC-C12) — every V2-CORE product is fixed-rate. A caller
    // explicitly asking for a nonzero band is rejected outright, never silently
    // coerced to "0" (coercion would hide the caller's actual intent from itself).
    let maxBonusPctOfBase = '0';
    if (body.maxBonusPctOfBase !== undefined && String(body.maxBonusPctOfBase).trim() !== '') {
      const band = new Decimal(String(body.maxBonusPctOfBase));
      if (!band.isFinite() || !band.eq(0)) {
        fail('V2-BAND products are not supported yet — maxBonusPctOfBase must be 0.', 'STAKE_PRODUCT_BAND_NOT_SUPPORTED', 400);
      }
      maxBonusPctOfBase = band.toFixed();
    }

    // §10-24 / CP-5′ — status is ALWAYS forced CLOSED on create, regardless of what
    // (if anything) the caller sent. The schema default is OPEN; this route is the
    // enforcement point, not the schema.
    const product = await prisma.stakingProductV2.create({
      data: { coin, name, termDays, baseDailyRatePct, maxBonusPctOfBase, minAmount, maxAmount, capacity, status: 'CLOSED' },
    });

    await recordAudit({
      adminId: (admin as { id?: string }).id, adminEmail: (admin as { email?: string }).email,
      action: 'STAKING_PRODUCT_V2_CREATE', targetType: 'stakingProductV2', targetId: product.id,
      detail: `Created V2 staking product "${name}" — ${coin}, ${termDays} days at ${baseDailyRatePct}%/day, capacity ${capacity} (CLOSED)`,
    });

    return NextResponse.json({ ok: true, data: { id: product.id } });
  } catch (e) { return adminErr(e); }
}
