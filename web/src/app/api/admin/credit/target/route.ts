export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/admin/credit/target?email=&coin= — target-account preview for the admin
// balance-adjustment screen, shown BEFORE submission so an AC-11 debit rejection is
// never a surprise after the confirmation modal (T-16 DC-2/§4.4).
//
// Unlike /context, this route DOES 403 when adminCreditEnabled is false (rev05a
// AC-13′ table): there is no reason to leave a user-balance lookup surface reachable
// while the whole feature is off, and this route only ever backs the (disabled) form.
//
// docs/specs/staking-yield-system-v2-prd-rev05a-admin-credit-rulings.md §1 (AC-13′)
// docs/specs/staking-yield-system-v2-design-t16-admin-credit-frd.md §5 DC-2

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { getUserCoinBalance, getUserAdminAdjustmentNet } from '@/lib/localLedger';
import { normalizeEmail, findAdminCreditTargetUser, getPlatformSettings } from '@/lib/adminCredit';

export async function GET(req: Request): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  const settings = await getPlatformSettings();
  if (!settings.adminCreditEnabled) {
    return NextResponse.json(
      { ok: false, code: 'ADMIN_CREDIT_DISABLED', message: 'Balance adjustment is off.' },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(req.url);
  const email = normalizeEmail(searchParams.get('email'));
  const coin = searchParams.get('coin')?.trim().toUpperCase() || '';

  if (!email || !coin) {
    return NextResponse.json(
      { ok: true, data: { found: false, userId: null, email, balance: null, held: null, available: null, adminAdjustmentNet: null, state: 'error' } },
    );
  }

  try {
    const user = await findAdminCreditTargetUser(email);
    if (!user) {
      // found:false is a real, well-formed answer — not a query failure. Never
      // conflated with state:'error' (T-16 DC-2 explicit).
      return NextResponse.json({
        ok: true,
        data: { found: false, userId: null, email, balance: null, held: null, available: null, adminAdjustmentNet: null, state: 'ok' },
      });
    }

    const view = await getUserCoinBalance(user.id, coin);
    const adminAdjustmentNet = await getUserAdminAdjustmentNet(user.id, coin);

    return NextResponse.json({
      ok: true,
      data: {
        found: true,
        userId: user.id,
        email: user.email,
        balance: view.balance,
        held: view.held,
        available: view.available,
        adminAdjustmentNet,
        state: 'ok',
      },
    });
  } catch (e) {
    console.error('[admin/credit/target GET]', e);
    // A query failure — never render "0" for balance/held/available here (T-16 §4.4
    // 3-state rule: targetLoading / targetError / real values).
    return NextResponse.json({
      ok: true,
      data: { found: null, userId: null, email, balance: null, held: null, available: null, adminAdjustmentNet: null, state: 'error' },
    });
  }
}
