// MLM commission math (Phase B) — pure, unit-testable, decimal.js only.
// Encodes the two reward layers from the deck (BANA-only, per senior):
//   Layer 1 (대·소실적 매칭, Slide 5): small-leg BANA volume → level B1–B10 →
//     daily match % applied to the small-leg's daily interest.
//   Layer 2 (유니레벨 부스트, Slide 6): for each activated downline generation,
//     a boost % applied to that generation's daily interest. A generation g is
//     "activated" when you have ≥ g qualifying direct referrals.
// A direct referral qualifies once they have ≥ MIN_QUALIFY BANA actively staked.
//
// NOTE: percentages/thresholds are the deck's DRAFT values; the uni-level base
// (per-generation interest) is our stated assumption pending final confirmation.
// All of it is behind a feature flag and off in production.
import Decimal from 'decimal.js';
import type { DownlineMember } from './referralTreeMath';
import { summarizeLines } from './referralTreeMath';

// Slide 5 — [minSmallLegVolume(BANA), dailyMatch%]. Highest tier met wins.
export const MATCH_TIERS: ReadonlyArray<readonly [string, string]> = [
  ['3000', '1.0'], ['10000', '1.5'], ['30000', '2.0'], ['100000', '2.8'], ['300000', '3.6'],
  ['700000', '4.5'], ['1500000', '5.5'], ['3000000', '6.6'], ['7000000', '8.0'], ['15000000', '10.0'],
];

// Slide 6 — boost % per generation (1대..10대); cumulative cap 30%.
export const UNILEVEL_BOOST: readonly string[] = ['5', '3', '3', '3', '2', '2', '2', '2', '3', '5'];
export const MIN_QUALIFY = '200'; // BANA actively staked to count as a direct referral

/** The daily match % for a given small-leg volume (0 if below B1). */
export function matchPct(smallLegVolume: string): string {
  const v = new Decimal(smallLegVolume || '0');
  let pct = '0';
  for (const [min, p] of MATCH_TIERS) {
    if (v.gte(new Decimal(min))) pct = p; else break;
  }
  return pct;
}

export interface BonusBreakdown {
  layer1: string;          // 대·소실적 매칭 (daily)
  layer2: string;          // 유니레벨 부스트 (daily)
  total: string;
  smallLegVolume: string;
  matchPct: string;
  directReferrals: number; // qualifying (≥ MIN_QUALIFY)
}

// Compute a user's daily commission from their downline (one settlement day).
export function computeBonus(members: DownlineMember[]): BonusBreakdown {
  const zero = new Decimal(0);
  if (members.length === 0) {
    return { layer1: '0', layer2: '0', total: '0', smallLegVolume: '0', matchPct: '0', directReferrals: 0 };
  }

  // ---- Layer 1: 대·소실적 매칭 ----
  const lines = summarizeLines(members);
  let bigLineId = lines[0]?.lineRootId ?? '';
  let bigVol = zero;
  for (const l of lines) {
    if (new Decimal(l.volume).gt(bigVol)) { bigVol = new Decimal(l.volume); bigLineId = l.lineRootId; }
  }
  const smallLegMembers = members.filter((m) => m.lineRootId !== bigLineId);
  const smallLegVolume = smallLegMembers.reduce((s, m) => s.plus(new Decimal(m.activeStake || '0')), zero);
  const smallLegInterest = smallLegMembers.reduce((s, m) => s.plus(new Decimal(m.dailyInterest || '0')), zero);
  const mPct = matchPct(smallLegVolume.toFixed());
  const layer1 = smallLegInterest.times(new Decimal(mPct).div(100));

  // ---- Layer 2: 유니레벨 부스트 ----
  const qualifyingDirects = members.filter(
    (m) => m.depth === 1 && new Decimal(m.activeStake || '0').gte(new Decimal(MIN_QUALIFY)),
  ).length;
  const activatedGens = Math.min(qualifyingDirects, UNILEVEL_BOOST.length);
  let layer2 = zero;
  for (let g = 1; g <= activatedGens; g += 1) {
    const genInterest = members
      .filter((m) => m.depth === g)
      .reduce((s, m) => s.plus(new Decimal(m.dailyInterest || '0')), zero);
    layer2 = layer2.plus(genInterest.times(new Decimal(UNILEVEL_BOOST[g - 1]).div(100)));
  }

  return {
    layer1: layer1.toFixed(),
    layer2: layer2.toFixed(),
    total: layer1.plus(layer2).toFixed(),
    smallLegVolume: smallLegVolume.toFixed(),
    matchPct: mPct,
    directReferrals: qualifyingDirects,
  };
}
