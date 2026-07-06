// Pure referral-tree structural math — no server-only/prisma deps, so it's unit
// testable. Turns a flat downline list into generations (대) and lines, and does
// the 대실적/소실적 split. NO commission percentages here.
import Decimal from 'decimal.js';

export interface DownlineMember {
  id: string;
  email: string;
  depth: number;        // 1 = direct referral (1대), 2 = their referrals (2대), …
  lineRootId: string;   // the direct referral whose sub-tree this member belongs to
  activeStake: string;  // sum of ACTIVE StakePosition principal (in the staked coin)
  dailyInterest: string; // sum of one day's interest across their ACTIVE stakes (principal × rate%/100)
}

export interface LineSummary {
  lineRootId: string;
  volume: string;
  members: number;
}

// Group the downline into lines (one per direct referral) with total volume.
export function summarizeLines(members: DownlineMember[]): LineSummary[] {
  const byLine = new Map<string, { volume: Decimal; members: number }>();
  for (const m of members) {
    const acc = byLine.get(m.lineRootId) ?? { volume: new Decimal(0), members: 0 };
    acc.volume = acc.volume.plus(new Decimal(m.activeStake || '0'));
    acc.members += 1;
    byLine.set(m.lineRootId, acc);
  }
  return [...byLine.entries()].map(([lineRootId, v]) => ({
    lineRootId, volume: v.volume.toFixed(), members: v.members,
  }));
}

// 대실적 / 소실적 split: the single largest line vs the sum of all the rest.
export function bigSmallLeg(lines: LineSummary[]): { big: string; small: string } {
  if (lines.length === 0) return { big: '0', small: '0' };
  let big = new Decimal(0);
  let total = new Decimal(0);
  for (const l of lines) {
    const v = new Decimal(l.volume);
    total = total.plus(v);
    if (v.gt(big)) big = v;
  }
  return { big: big.toFixed(), small: total.minus(big).toFixed() };
}

export interface GenerationSummary {
  depth: number;
  volume: string;
  members: number;
}

// Total active stake per generation (1대, 2대, …).
export function summarizeGenerations(members: DownlineMember[]): GenerationSummary[] {
  const byGen = new Map<number, { volume: Decimal; members: number }>();
  for (const m of members) {
    const acc = byGen.get(m.depth) ?? { volume: new Decimal(0), members: 0 };
    acc.volume = acc.volume.plus(new Decimal(m.activeStake || '0'));
    acc.members += 1;
    byGen.set(m.depth, acc);
  }
  return [...byGen.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([depth, v]) => ({ depth, volume: v.volume.toFixed(), members: v.members }));
}

// Count of direct referrals (1대) — used to "activate" uni-level generations.
export function directReferralCount(members: DownlineMember[]): number {
  return members.filter((m) => m.depth === 1).length;
}
