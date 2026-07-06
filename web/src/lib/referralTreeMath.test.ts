import { describe, it, expect } from 'vitest';
import {
  summarizeLines, bigSmallLeg, summarizeGenerations, directReferralCount,
  type DownlineMember,
} from './referralTreeMath';

// Structural referral-tree math (no commission %). Verifies the 대실적/소실적
// split against the exact worked example on Slide 5 of the deck.
describe('referralTreeMath', () => {
  // Four lines under the root: A=1,000,000 (400k self + 600k sub), B=300,000,
  // C=200,000, D=100,000 — all in BANA.
  const members: DownlineMember[] = [
    { id: 'A', email: 'a', depth: 1, lineRootId: 'A', activeStake: '400000', dailyInterest: '0' },
    { id: 'A1', email: 'a1', depth: 2, lineRootId: 'A', activeStake: '600000', dailyInterest: '0' },
    { id: 'B', email: 'b', depth: 1, lineRootId: 'B', activeStake: '300000', dailyInterest: '0' },
    { id: 'C', email: 'c', depth: 1, lineRootId: 'C', activeStake: '200000', dailyInterest: '0' },
    { id: 'D', email: 'd', depth: 1, lineRootId: 'D', activeStake: '100000', dailyInterest: '0' },
  ];

  it('summarizeLines totals each direct-referral line', () => {
    const lines = summarizeLines(members);
    const byId = Object.fromEntries(lines.map((l) => [l.lineRootId, l.volume]));
    expect(byId.A).toBe('1000000');
    expect(byId.B).toBe('300000');
    expect(byId.C).toBe('200000');
    expect(byId.D).toBe('100000');
  });

  it('bigSmallLeg = largest line vs sum of the rest (Slide 5 example)', () => {
    const { big, small } = bigSmallLeg(summarizeLines(members));
    expect(big).toBe('1000000');          // 대실적 = A
    expect(small).toBe('600000');         // 소실적 = B+C+D
  });

  it('directReferralCount = number of 1대 members (uni-level activation)', () => {
    expect(directReferralCount(members)).toBe(4);
  });

  it('summarizeGenerations totals active stake per 대', () => {
    const gens = summarizeGenerations(members);
    expect(gens.find((g) => g.depth === 1)?.volume).toBe('1000000'); // 400k+300k+200k+100k
    expect(gens.find((g) => g.depth === 2)?.volume).toBe('600000');
  });

  it('handles an empty downline', () => {
    expect(bigSmallLeg([])).toEqual({ big: '0', small: '0' });
    expect(directReferralCount([])).toBe(0);
  });
});
