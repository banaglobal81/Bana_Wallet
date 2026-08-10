export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { getUserCoinBalance } from '@/lib/localLedger';
import { getPlatformSettings } from '@/lib/platformSettings';

// GET /api/wallet/local-balance — V2-CORE (A-3/A-7) LOCAL-authority balance
// display (docs/specs/staking-yield-system-v2-design-a7-screen-flow-frd.md §3,
// R-A7-1~R-A7-4). This is NOT a Nia-Hub proxy — it reads BANA's own local
// ledger (getUserCoinBalance) for coins whose `balanceAuthority` is LOCAL
// (today: BANA only). Kept as its own response shape (never merged with the
// hub balance array) so a caller can never `.reduce()` the two together
// (AC-A7-01/02 — LA-1 "two authorities, two blocks, no total").
//
// Per-coin `state` distinguishes "loaded, real numbers" from "failed to load"
// so the client never renders a load failure as a silent 0 (LB-7).

interface LocalBalanceCoin {
  coin: string;
  state: 'ok' | 'error';
  balance?: string;
  available?: string;
  holds?: { stakePrincipal: string; withdrawalPending: string; other: string };
  withdrawalRequestId?: string | null;
  alertStage?: 'CLEAR' | 'T1_WARNING' | 'T2_HALTED';
  // LA-3 — three independent rail flags, server-decided. `yieldRail` here
  // mirrors PlatformSetting.stakingClaimEnabled (the only claim kill switch
  // that exists today); `localWithdrawRail`/`localDepositRail` are computed
  // per-coin below. Never combine these into one boolean (LA-3 closing note).
  yieldRail?: 'LEDGER_ONLY' | 'CLAIM_LIVE';
  localWithdrawRail?: 'UNAVAILABLE' | 'LIVE' | 'PAUSED';
  localDepositRail?: 'UNSUPPORTED';
}

// A-7 WD-5 / N-12: a LOCAL-authority coin's withdrawal rail is LIVE only when
// an admin has actually configured a fee + minimum for at least one network.
// No admin surface writes these fields yet (ManagedCoinNetwork has no fee/min
// today — see the report handed back with this change) — so in practice this
// always resolves to UNAVAILABLE right now. That is the correct, honest
// behavior: "unset" must never be read as "zero" (A-3 §1 principle 5).
function hasConfiguredWithdrawTerms(networks: unknown): boolean {
  if (!Array.isArray(networks)) return false;
  return networks.some((n) => {
    const rec = n as Record<string, unknown>;
    return rec?.withdrawFeeAmount != null && rec?.withdrawMinAmount != null;
  });
}

export async function GET(): Promise<NextResponse> {
  let userId: string;
  try {
    await requireUser();
    const u = (await auth())?.user as { id?: string } | undefined;
    if (!u?.id) throw Object.assign(new Error('Unauthorized'), { status: 401 });
    userId = u.id;
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  const localCoins = await prisma.managedCoin.findMany({
    where: { balanceAuthority: 'LOCAL', visible: true },
    select: { symbol: true, authorityAlertStage: true, networks: true },
    orderBy: { symbol: 'asc' },
  });

  const settings = await getPlatformSettings().catch(() => null);
  const yieldRail: LocalBalanceCoin['yieldRail'] = settings?.stakingClaimEnabled ? 'CLAIM_LIVE' : 'LEDGER_ONLY';

  const coins: LocalBalanceCoin[] = [];
  for (const c of localCoins) {
    try {
      const view = await getUserCoinBalance(userId, c.symbol);

      const holds = await prisma.localBalanceHold.findMany({
        where: { userId, coin: c.symbol, status: 'ACTIVE' },
        select: { amount: true, reasonCode: true, relatedId: true },
      });
      let stakePrincipal = new Decimal(0);
      let withdrawalPending = new Decimal(0);
      let other = new Decimal(0);
      let withdrawalRequestId: string | null = null;
      for (const h of holds) {
        const amt = new Decimal(h.amount);
        if (h.reasonCode === 'STAKE_PRINCIPAL_LOCK') {
          stakePrincipal = stakePrincipal.plus(amt);
        } else if (h.reasonCode === 'WITHDRAWAL_PENDING') {
          withdrawalPending = withdrawalPending.plus(amt);
          withdrawalRequestId = withdrawalRequestId ?? h.relatedId ?? null;
        } else {
          // LB-4 — an unrecognized hold reason is shown as its own "other"
          // row, never silently folded into a known bucket.
          other = other.plus(amt);
        }
      }

      coins.push({
        coin: c.symbol,
        state: 'ok',
        balance: view.balance,
        available: view.available,
        holds: {
          stakePrincipal: stakePrincipal.toFixed(),
          withdrawalPending: withdrawalPending.toFixed(),
          other: other.toFixed(),
        },
        withdrawalRequestId,
        alertStage: c.authorityAlertStage,
        yieldRail,
        localWithdrawRail: hasConfiguredWithdrawTerms(c.networks) ? 'LIVE' : 'UNAVAILABLE',
        localDepositRail: 'UNSUPPORTED',
      });
    } catch {
      coins.push({ coin: c.symbol, state: 'error' });
    }
  }

  return NextResponse.json({ ok: true, data: { coins } });
}
