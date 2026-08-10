// Client helper for the V2-CORE LOCAL-authority balance display
// (docs/specs/staking-yield-system-v2-design-a7-screen-flow-frd.md §3).
//
// This talks to BANA's OWN /api/wallet/local-balance route, not Nia-Hub — it
// is deliberately NOT in niaApi.ts (that file is reserved for the /api/nia/*
// proxy per the Hub Call Rules). No secret, no hub round-trip.

export interface LocalBalanceHolds {
  stakePrincipal: string;
  withdrawalPending: string;
  other: string;
}

export interface LocalBalanceCoin {
  coin: string;
  state: 'ok' | 'error';
  balance?: string;
  available?: string;
  holds?: LocalBalanceHolds;
  withdrawalRequestId?: string | null;
  alertStage?: 'CLEAR' | 'T1_WARNING' | 'T2_HALTED';
  yieldRail?: 'LEDGER_ONLY' | 'CLAIM_LIVE';
  localWithdrawRail?: 'UNAVAILABLE' | 'LIVE' | 'PAUSED';
  localDepositRail?: 'UNSUPPORTED';
}

/**
 * The user's LOCAL-authority balances (today: BANA only, if any ManagedCoin
 * row is LOCAL-authority and visible). Never merge this with getNiaBalance()'s
 * result — the two are different balance authorities and must render as two
 * separate blocks with no combined total (A-7 LA-1 / AC-A7-01).
 */
export async function getLocalBalance(): Promise<LocalBalanceCoin[]> {
  const res = await fetch('/api/wallet/local-balance', { headers: { Accept: 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) {
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  return Array.isArray(body?.data?.coins) ? body.data.coins : [];
}
