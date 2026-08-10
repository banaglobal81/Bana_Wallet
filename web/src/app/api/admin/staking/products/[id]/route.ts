export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit';
import { getPlatformSettings } from '@/lib/platformSettings';
import { checkInterestLiabilityCap, isFirstTrancheTermDays } from '@/lib/stakingProductAdmin';

// docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md §5.1 CUT-2 /
// T-5 — StakingProductV2 CRUD. CP-6 (open a CLOSED product), CP-7′ (10/30/90-day
// first tranche only — 180/360 can never open and must stay at capacity/rate "0"),
// and CP-10 (interest liability cap, on open / capacity-raise / rate-change of an
// OPEN product) are enforced here.

function adminErr(e: unknown) {
  const err = e as Error & { status?: number; code?: string; params?: Record<string, string> };
  return NextResponse.json({ ok: false, error: err.message, code: err.code, params: err.params }, { status: err.status ?? 500 });
}
function fail(message: string, code: string, status: number, params?: Record<string, string>): never {
  throw Object.assign(new Error(message), { code, status, params });
}
// Money fields stay non-null once CP-5′ made them required at creation, but PATCH
// still guards against a caller trying to null one out (undefined = "leave as is",
// which is the only way to omit a field on PATCH).
function parseRequiredMoney(v: unknown, field: string, code: string): string {
  if (v === undefined || v === null || String(v).trim() === '') fail(`${field} is required.`, code, 400);
  const d = new Decimal(String(v));
  if (!d.isFinite() || d.lt(0)) fail(`${field} must be a non-negative number.`, code, 400);
  return d.toFixed();
}

// PATCH /api/admin/staking/products/[id] — edit a V2 product, or open/close it.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  let admin;
  try { admin = await requireAdmin(); } catch (e) { return adminErr(e); }
  const { id } = await params;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}

  try {
    const existing = await prisma.stakingProductV2.findUnique({ where: { id } });
    if (!existing) fail('Product not found', 'STAKE_PRODUCT_NOT_FOUND', 404);

    const data: Record<string, unknown> = {};
    const changes: string[] = [];
    let openingNow = false;

    if (body.status !== undefined) {
      const status = String(body.status).toUpperCase();
      if (status !== 'OPEN' && status !== 'CLOSED') fail('status must be OPEN or CLOSED', 'STAKE_PRODUCT_STATUS_INVALID', 400);
      if (status !== existing.status) {
        data.status = status;
        changes.push(status === 'OPEN' ? 'Opened' : 'Closed');
        openingNow = status === 'OPEN';
      }
    }
    if (body.name !== undefined && String(body.name).trim()) {
      data.name = String(body.name).trim(); changes.push('renamed');
    }
    if (body.baseDailyRatePct !== undefined) {
      const rateRaw = String(body.baseDailyRatePct).trim();
      if (rateRaw === '') fail('Daily rate is required.', 'STAKE_PRODUCT_RATE_REQUIRED', 400);
      const rate = new Decimal(rateRaw);
      if (!rate.isFinite() || rate.lt(0)) fail('Daily rate must be zero or a positive number.', 'STAKE_PRODUCT_RATE_INVALID', 400);
      data.baseDailyRatePct = rate.toFixed(); changes.push(`rate → ${rate.toFixed()}%/day`);
    }
    if (body.minAmount !== undefined) data.minAmount = parseRequiredMoney(body.minAmount, 'Minimum stake', 'STAKE_PRODUCT_MIN_REQUIRED');
    if (body.maxAmount !== undefined) data.maxAmount = parseRequiredMoney(body.maxAmount, 'Maximum stake', 'STAKE_PRODUCT_MAX_REQUIRED');
    if (body.capacity !== undefined) data.capacity = parseRequiredMoney(body.capacity, 'Capacity', 'STAKE_PRODUCT_CAPACITY_REQUIRED');
    // maxBonusPctOfBase is never editable via this route — V2-BAND is out of
    // scope for the whole cutover (AC-C12); the field is always "0" for the
    // lifetime of every V2-CORE product, so there is nothing to PATCH here.
    if (body.maxBonusPctOfBase !== undefined && !new Decimal(String(body.maxBonusPctOfBase)).eq(0)) {
      fail('V2-BAND products are not supported yet — maxBonusPctOfBase must stay 0.', 'STAKE_PRODUCT_BAND_NOT_SUPPORTED', 400);
    }

    const resultMinAmount = (data.minAmount as string | undefined) ?? existing.minAmount;
    const resultMaxAmount = (data.maxAmount as string | undefined) ?? existing.maxAmount;
    const resultCapacity = (data.capacity as string | undefined) ?? existing.capacity;
    const resultRate = (data.baseDailyRatePct as string | undefined) ?? existing.baseDailyRatePct;
    const resultStatus = (data.status as string | undefined) ?? existing.status;

    // CP-7′ (rev05 §4.5, qa-lead FAIL → route-enforced) — termDays is fixed at
    // creation (never editable via this route — no `body.termDays` handling
    // above), so `existing.termDays` is authoritative for the product's whole
    // lifetime. Two independent gates, both unconditional on status:
    //   (a) a 180/360-day product can NEVER transition to OPEN — CP-7′ says the
    //       first tranche IS 10/30/90, not "180/360 may open once zeroed".
    //   (b) any edit that would leave a 180/360-day row's capacity or rate
    //       non-"0" is rejected outright, independent of open/closed — keeps the
    //       CP-5′ ⓑ "double lock" a standing invariant, not just a creation-time
    //       nicety an admin could later undo with a harmless-looking PATCH.
    if (!isFirstTrancheTermDays(existing.termDays)) {
      if (openingNow) {
        fail(
          `${existing.termDays}-day products are not part of the first tranche yet (CP-7′) and cannot be opened.`,
          'STAKE_PRODUCT_TERM_NOT_FIRST_TRANCHE',
          409,
          { termDays: String(existing.termDays) },
        );
      }
      if (data.baseDailyRatePct !== undefined || data.capacity !== undefined) {
        if (!new Decimal(resultRate).eq(0) || !new Decimal(resultCapacity ?? '0').eq(0)) {
          fail(
            `${existing.termDays}-day products are not part of the first tranche yet (CP-7′) — capacity and daily rate must both stay "0".`,
            'STAKE_PRODUCT_TERM_NOT_FIRST_TRANCHE',
            409,
            { termDays: String(existing.termDays) },
          );
        }
      }
    }

    // CP-10 (rev05 §4.6) trigger: (a) CLOSED→OPEN transition, (b) a capacity raise
    // on a product that is (or is becoming) OPEN, or (c) ANY baseDailyRatePct edit
    // on a product that is (or is becoming) OPEN. (c) closes a wallet-security-expert
    // CUT-2 review finding: CP-10's formula is capacity × rate × termDays, so a
    // rate-only PATCH on an already-OPEN product changes the liability just as much
    // as a capacity raise does and must be re-checked too — even a rate LOWER is
    // included (not just raises) to keep this trigger simple and never miss a case,
    // matching the reviewer's explicit instruction rather than trying to prove a
    // lower rate can never matter. A capacity LOWER alone, a rename alone, or any
    // edit to an already-CLOSED product still never triggers this.
    const capacityRaising =
      data.capacity !== undefined &&
      existing.capacity != null &&
      new Decimal(resultCapacity ?? '0').gt(new Decimal(existing.capacity));
    const rateChanging = data.baseDailyRatePct !== undefined;
    const needsLiabilityCheck = resultStatus === 'OPEN' && (openingNow || capacityRaising || rateChanging);

    if (openingNow) {
      // CP-6 ① — capacity/minAmount/maxAmount non-null (CP-5′ already made these
      // required at creation, so this only re-defends against a stale/legacy row).
      if (resultMinAmount == null || resultMaxAmount == null || resultCapacity == null) {
        fail(
          'This product is missing minAmount/maxAmount/capacity and cannot be opened.',
          'STAKE_PRODUCT_OPEN_MISSING_LIMITS',
          409,
        );
      }
      // CP-6 ② — maxBonusPctOfBase == "0" (always true in V2-CORE, re-checked defensively).
      if (!new Decimal(existing.maxBonusPctOfBase).eq(0)) {
        fail('V2-BAND products cannot be opened yet.', 'STAKE_PRODUCT_BAND_NOT_SUPPORTED', 409);
      }
      // CP-6 ③ — baseDailyRatePct > 0 only at OPEN time (not at creation — §4.3 ⓑ).
      if (new Decimal(resultRate).lte(0)) {
        fail('This product needs a daily rate greater than 0 before it can be opened.', 'STAKE_PRODUCT_OPEN_RATE_ZERO', 409);
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: true, data: { id } });
    }

    if (needsLiabilityCheck) {
      // wallet-security-expert CUT-2 review: the check (read otherOpen + settings)
      // and the write (the update below) must be ATOMIC and globally serialized
      // against every other concurrent open/capacity-raise/rate-change PATCH on
      // ANY product — CP-10 sums across the whole catalog, not just this row, so
      // two admins each opening/raising a DIFFERENT product concurrently could
      // otherwise each read the other's pre-commit snapshot, both compute
      // "individually under cap", and together push the real total over it. Same
      // failure mode createStakePositionV2's `stake_coin:${coin}` lock closes
      // (web/src/lib/stakingV2.ts) and api/staking/stake/route.ts's advisory lock
      // closes — mirrored here with one fixed key (CP-10's sum spans every coin's
      // products today; scope the key by coin if that ever changes).
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'staking_product_liability_cap'}, 0))`;

        const settings = await getPlatformSettings(tx);
        const otherOpen = await tx.stakingProductV2.findMany({
          where: { status: 'OPEN', id: { not: id } },
          select: { id: true, capacity: true, baseDailyRatePct: true, termDays: true },
        });
        const check = checkInterestLiabilityCap(
          [...otherOpen, { id, capacity: resultCapacity, baseDailyRatePct: resultRate, termDays: existing.termDays }],
          settings.maxInterestLiabilityCapBana,
        );
        if (!check.ok) {
          fail(
            check.cap == null
              ? 'The platform interest-liability cap is not configured — no product may be opened, capacity-raised, or rate-changed until it is set.'
              : `This change would push the platform's total interest liability to ${check.projected} BANA, which exceeds the configured cap of ${check.cap} BANA (over by ${check.excess}).`,
            'PRODUCT_OPEN_EXCEEDS_INTEREST_LIABILITY_CAP',
            409,
            { projected: check.projected, cap: check.cap ?? '', excess: check.excess ?? '' },
          );
        }

        await tx.stakingProductV2.update({ where: { id }, data });
      });
    } else {
      await prisma.stakingProductV2.update({ where: { id }, data });
    }

    await recordAudit({
      adminId: (admin as { id?: string }).id, adminEmail: (admin as { email?: string }).email,
      // CP-6 ⑤ — opening a product is, by design, the single largest per-action
      // liability-increasing event on this screen; it gets its own action name so
      // it's grep-able in the audit log, distinct from an ordinary field edit.
      action: openingNow ? 'STAKING_PRODUCT_V2_OPEN' : 'STAKING_PRODUCT_V2_UPDATE',
      targetType: 'stakingProductV2', targetId: id,
      detail: `V2 staking "${existing.name}": ${changes.join(' · ') || 'updated'}`,
    });
    return NextResponse.json({ ok: true, data: { id } });
  } catch (e) { return adminErr(e); }
}

// DELETE /api/admin/staking/products/[id] — only allowed when no V2 positions exist.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  let admin;
  try { admin = await requireAdmin(); } catch (e) { return adminErr(e); }
  const { id } = await params;

  const product = await prisma.stakingProductV2.findUnique({ where: { id } });
  if (!product) return NextResponse.json({ ok: false, error: 'Product not found' }, { status: 404 });

  const count = await prisma.stakePositionV2.count({ where: { productId: id } });
  if (count > 0) {
    return NextResponse.json(
      { ok: false, error: 'This product has stakes and cannot be deleted. Close it instead to stop new stakes.' },
      { status: 409 },
    );
  }

  await prisma.stakingProductV2.delete({ where: { id } });
  await recordAudit({
    adminId: (admin as { id?: string }).id, adminEmail: (admin as { email?: string }).email,
    action: 'STAKING_PRODUCT_V2_DELETE', targetType: 'stakingProductV2', targetId: id,
    detail: `Deleted V2 staking product "${product.name}"`,
  });
  return NextResponse.json({ ok: true, data: { id } });
}
