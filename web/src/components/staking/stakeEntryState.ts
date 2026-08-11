// docs/specs/staking-yield-system-v2-design-t8-stake-flow-frd.md §3 — the
// S-STAKE entry state machine (E-0..E-7). This is the ONE place the seven
// (+loading) states are derived; StakeSheet/VaultControlBar/DeepCoreHud all
// read the result of `deriveStakeEntryState` rather than re-deriving their
// own subset of the same rule (§3.1: "모든 판별자는 서버가 내려주는 명시
// 값이다... 클라이언트는 alertStage를 보고 규칙을 재구현하지 않는다").
//
// KNOWN GAP (see the T-9 report to the parent agent): DC-1 (`stakeRail`),
// DC-2 (`newPositionState`) and DC-10 (`autoRenewRail`) are not yet served
// by `GET /api/staking/products` — that field-by-field work belongs to
// `web-shared-expert` (rev05 §5.2① lists api/staking/products/route.ts and
// lib/stakingV2.ts as that agent's files, not this one's). Until then:
//   - `stakeRail` absent => treated as `'LIVE'` (not MIGRATING). The legacy
//     v1 fail-closed 503 stub this flag exists to track is already gone
//     (api/staking/stake/route.ts's own comment confirms the rewrite
//     replaced it), so defaulting to "not paused" reflects today's actual
//     server behavior; the day the server adds `stakeRail`, this activates
//     automatically without another change here (EM-3's "same module"
//     principle extends to "and this client trusts it the moment it exists").
//   - `newPositionState` isn't derivable as a single boolean from anything
//     this client can fetch today, so HALTED is approximated from
//     `local-balance`'s per-coin `alertStage` (T2_HALTED/T1_WARNING — 2 of
//     the 4 reasons `assertExecutionAllowed(coin,'NEW_POSITION')` can throw
//     for). The other two (DIRECT_CHANGE_IN_PROGRESS/TRANSITION_IN_PROGRESS)
//     are rare, admin-driven states with no client-visible flag at all; a
//     stake attempt during one of those still correctly bounces back to this
//     same HALTED block one round trip later, via the stake route's own
//     403 + the §7.2 error-code transition StakeSheet implements — just not
//     pre-emptively at STEP 1/2 the way DC-2 would allow.
//   - `autoRenewRail` absent => treated as `'UNAVAILABLE'` (CP1-10's own
//     fail-closed rule, restated at the one call site that reads it,
//     StakeSheet's STEP 3).
import Decimal from 'decimal.js';
import type { StakingProduct } from '../../utils/stakingApi';
import type { LocalBalanceCoin } from '../../utils/localBalanceApi';

export type StakeEntryState =
  | { kind: 'LOADING' }
  | { kind: 'MIGRATING' }
  | { kind: 'HALTED'; coin: string }
  | { kind: 'NO_OFFERS' }
  | { kind: 'BALANCE_UNKNOWN'; coin: string }
  | {
      kind: 'LOCKED_OUT';
      coin: string;
      stakePrincipal: string;
      withdrawalPending: string;
      other: string;
    }
  | { kind: 'NO_FUNDS'; coin: string; available: string; showNoPath: boolean }
  | { kind: 'READY' };

const ZERO_HOLDS = { stakePrincipal: '0', withdrawalPending: '0', other: '0' };

/** §3.2 — first-true-wins, in exactly this order. */
export function deriveStakeEntryState(opts: {
  loading: boolean;
  products: StakingProduct[];
  localCoins: LocalBalanceCoin[];
}): StakeEntryState {
  const { loading, products, localCoins } = opts;
  if (loading) return { kind: 'LOADING' };

  // E-1 MIGRATING (DC-1 — see gap note above).
  if (products.some((p) => p.stakeRail && p.stakeRail !== 'LIVE')) {
    return { kind: 'MIGRATING' };
  }

  // E-2 HALTED (DC-2 approximation — see gap note above). Scoped to coins
  // that actually have an OPEN product, so with zero products this loop is a
  // no-op and falls through to NO_OFFERS (S-4/S-5 + §3.2's own precedence:
  // HALTED only matters when there is something to halt).
  const coinsInUse = Array.from(new Set(products.map((p) => p.coin)));
  for (const coin of coinsInUse) {
    const lb = localCoins.find((c) => c.coin === coin);
    if (lb?.state === 'ok' && lb.alertStage && lb.alertStage !== 'CLEAR') {
      return { kind: 'HALTED', coin };
    }
  }

  // E-3 NO_OFFERS.
  if (products.length === 0) return { kind: 'NO_OFFERS' };

  // minRequired = min(OPEN product minAmount). A null observation (CP-5′
  // should prevent this server-side; DC-3's null-exclusion isn't enforced by
  // /api/staking/products yet either — see the T-9 report) drops to
  // BALANCE_UNKNOWN rather than being read as 0 (§3.1's own instruction).
  const withMin = products.filter((p) => p.minAmount != null);
  const coin = products[0].coin;
  if (withMin.length === 0) {
    return { kind: 'BALANCE_UNKNOWN', coin };
  }
  const minRequired = withMin.reduce(
    (min, p) => Decimal.min(min, new Decimal(p.minAmount as string)),
    new Decimal(withMin[0].minAmount as string),
  );

  const lb = localCoins.find((c) => c.coin === coin);
  if (!lb || lb.state !== 'ok' || lb.available == null) {
    return { kind: 'BALANCE_UNKNOWN', coin };
  }

  // SB-1 — `available` rendered/compared as the server gave it, never
  // re-derived by subtracting a client-side locked-principal figure (that
  // would double-count — the server already netted holds out of `available`).
  const available = new Decimal(lb.available);
  if (available.gte(minRequired)) return { kind: 'READY' };

  const holds = lb.holds ?? ZERO_HOLDS;
  const holdsTotal = new Decimal(holds.stakePrincipal).plus(holds.withdrawalPending).plus(holds.other);
  if (holdsTotal.gt(0)) {
    // E-5 LOCKED_OUT — this ordering (checked before NO_FUNDS) is the one
    // thing in §3.2 that keeps `noFundsNoPath` from becoming a lie for a
    // user whose money is real but held, not absent.
    return { kind: 'LOCKED_OUT', coin, ...holds };
  }

  // E-6 NO_FUNDS. showNoPath is itself a rail-gated sentence (S-3/AC-T8-11)
  // — it must disappear the instant either rail opens, not stay pinned by
  // this render having once been true.
  const showNoPath = lb.localDepositRail === 'UNSUPPORTED' && lb.yieldRail !== 'CLAIM_LIVE';
  return { kind: 'NO_FUNDS', coin, available: lb.available, showNoPath };
}
