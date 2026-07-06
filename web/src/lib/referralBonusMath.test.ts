import { describe, it, expect } from 'vitest';
import { computeBonus, matchPct } from './referralBonusMath';
import type { DownlineMember } from './referralTreeMath';

// MLM commission math — the numbers below are hand-verifiable (checklist #3).
describe('referralBonusMath', () => {
  it('matchPct picks the highest B1–B10 tier met (BANA)', () => {
    expect(matchPct('2999')).toBe('0');        // below B1
    expect(matchPct('3000')).toBe('1.0');      // B1
    expect(matchPct('550000')).toBe('3.6');    // B5 (≥300k, <700k)
    expect(matchPct('15000000')).toBe('10.0'); // B10
    expect(matchPct('99999999')).toBe('10.0'); // capped at B10
  });

  // Worked example (all BANA):
  //   Directs: A, B, C (all staked ≥200 → 3 qualifying directs).
  //   Line A: A(stake 1,000,000, int 2000) + A1(depth2, stake 500,000, int 1000) = 1,500,000
  //   Line B: B(stake 300,000, int 600)   + B1(depth2, stake 50,000,  int 100)  =   350,000
  //   Line C: C(stake 200,000, int 400)                                          =   200,000
  const members: DownlineMember[] = [
    { id: 'A', email: 'a', depth: 1, lineRootId: 'A', activeStake: '1000000', dailyInterest: '2000' },
    { id: 'A1', email: 'a1', depth: 2, lineRootId: 'A', activeStake: '500000', dailyInterest: '1000' },
    { id: 'B', email: 'b', depth: 1, lineRootId: 'B', activeStake: '300000', dailyInterest: '600' },
    { id: 'B1', email: 'b1', depth: 2, lineRootId: 'B', activeStake: '50000', dailyInterest: '100' },
    { id: 'C', email: 'c', depth: 1, lineRootId: 'C', activeStake: '200000', dailyInterest: '400' },
  ];

  it('Layer 1 (대·소실적 매칭): match% × small-leg daily interest', () => {
    const b = computeBonus(members);
    // Big line = A (1,500,000). Small-leg = B + C lines = B, B1, C.
    // small-leg volume = 300,000 + 50,000 + 200,000 = 550,000 → B5 → 3.6%
    expect(b.smallLegVolume).toBe('550000');
    expect(b.matchPct).toBe('3.6');
    // small-leg daily interest = 600 + 100 + 400 = 1100 → 3.6% × 1100 = 39.6
    expect(b.layer1).toBe('39.6');
  });

  it('Layer 2 (유니레벨 부스트): boost% × each activated generation interest', () => {
    const b = computeBonus(members);
    // 3 qualifying directs → generations 1,2,3 activated (boosts 5%,3%,3%).
    // Gen1 interest = A+B+C = 2000+600+400 = 3000 → 5% = 150
    // Gen2 interest = A1+B1 = 1000+100 = 1100 → 3% = 33
    // Gen3 interest = 0 → 3% = 0
    expect(b.directReferrals).toBe(3);
    expect(b.layer2).toBe('183'); // 150 + 33
  });

  it('total daily commission = Layer1 + Layer2', () => {
    expect(computeBonus(members).total).toBe('222.6'); // 39.6 + 183
  });

  it('no downline → no commission', () => {
    expect(computeBonus([]).total).toBe('0');
  });

  it('uni-level generation is gated by qualifying direct-referral count', () => {
    // Only 1 direct that qualifies (D has 100 BANA < 200 MIN_QUALIFY → not counted).
    const m: DownlineMember[] = [
      { id: 'X', email: 'x', depth: 1, lineRootId: 'X', activeStake: '5000', dailyInterest: '10' },
      { id: 'D', email: 'd', depth: 1, lineRootId: 'D', activeStake: '100', dailyInterest: '1' },
      { id: 'X2', email: 'x2', depth: 2, lineRootId: 'X', activeStake: '5000', dailyInterest: '10' },
    ];
    const b = computeBonus(m);
    // qualifying directs = 1 (X) → only gen 1 activated. Gen1 interest = 10 + 1 = 11 → 5% = 0.55
    expect(b.directReferrals).toBe(1);
    expect(b.layer2).toBe('0.55');
  });
});
