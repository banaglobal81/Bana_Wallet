export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/admin/credit/context?coin=<symbol> — screen-load data for the admin
// balance-adjustment screen (T-16 DC-1). Deliberately NOT gated by
// adminCreditEnabled: rev05a AC-13′ requires this to still answer 200 while the
// surface is off, honestly reporting `enabled:false`, so the page can render its
// DISABLED state instead of falling into LOAD_FAILED (a real query failure would be
// mistaken for "the toggle is off" otherwise — see the T-16 §3.1 LOAD_FAILED-vs-
// DISABLED priority ruling).
//
// docs/specs/staking-yield-system-v2-prd-rev05a-admin-credit-rulings.md §1 (AC-13′)
// docs/specs/staking-yield-system-v2-design-t16-admin-credit-frd.md §5 DC-1

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { listLocalAdminCreditCoins, computeAdminCreditLimitRows, getPlatformSettings } from '@/lib/adminCredit';

export async function GET(req: Request): Promise<NextResponse> {
  let admin: { id?: string };
  try {
    admin = (await requireAdmin()) as { id?: string };
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }
  if (!admin.id) {
    return NextResponse.json({ ok: true, data: { enabled: null, coins: null, limits: null, state: 'error' } });
  }

  const { searchParams } = new URL(req.url);
  const coinParam = searchParams.get('coin')?.trim().toUpperCase() || null;

  try {
    const settings = await getPlatformSettings();
    const enabled = settings.adminCreditEnabled;
    const coins = await listLocalAdminCreditCoins();

    // AC-T16-16 — only compute usage figures for a coin actually present in the
    // LOCAL-authority list; an unrecognized/HUB `coin` gets config-only limit rows
    // (used/remaining left null), never a silent fallback to some default coin.
    const selectedCoin = coinParam && coins.some((c) => c.symbol === coinParam) ? coinParam : null;
    const limits = await computeAdminCreditLimitRows({ adminId: admin.id, coin: selectedCoin, settings });

    return NextResponse.json({ ok: true, data: { enabled, coins, limits, state: 'ok' } });
  } catch (e) {
    // DC-1 — "부분 성공을 부분 렌더하지 않는다": any failure collapses every field to
    // null (never leave some populated and others not, and never substitute "0"/
    // "false" for an uncomputed value — the client must not read a real figure).
    console.error('[admin/credit/context GET]', e);
    return NextResponse.json({ ok: true, data: { enabled: null, coins: null, limits: null, state: 'error' } });
  }
}
