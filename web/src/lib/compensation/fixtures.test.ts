// Locks the demo fixture's shape and percentages, and guards the two rules the
// snapshot exists to enforce: binary cap is never a progress row, and progress
// is always measured against the NEXT rank.
import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { FIXTURE_RANK_SNAPSHOT, buildRankSnapshot, mockRelayUser } from './fixtures';
import { getRankRequirements } from './calc';

describe('mockRelayUser', () => {
  it('is a Relay sitting exactly on Relay’s own thresholds', () => {
    const relay = getRankRequirements('relay');
    expect(mockRelayUser.currentRank).toBe('relay');
    expect(mockRelayUser.personalCustomers).toBe(relay?.personalCustomers);
    expect(mockRelayUser.weakLegCV.equals(relay!.weakLegCV!)).toBe(true);
    expect(mockRelayUser.activeSlots).toBe(relay?.activeSlots);
  });

  it('carries no binary value — binary cap comes from RANKS, not the user', () => {
    expect(Object.keys(mockRelayUser)).toEqual([
      'currentRank', 'personalCustomers', 'weakLegCV', 'activeSlots',
    ]);
  });
});

describe('FIXTURE_RANK_SNAPSHOT', () => {
  it('is a Relay working toward Beacon', () => {
    expect(FIXTURE_RANK_SNAPSHOT.currentRank.id).toBe('relay');
    expect(FIXTURE_RANK_SNAPSHOT.nextRank?.id).toBe('beacon');
  });

  it('is flagged as fixture data', () => {
    expect(FIXTURE_RANK_SNAPSHOT.isFixture).toBe(true);
  });

  it('exposes exactly three progress rows — never binary cap', () => {
    const labels = FIXTURE_RANK_SNAPSHOT.requirements.map((r) => r.label);
    expect(labels).toEqual(['Personal Customers', 'Weak-Leg CV', 'Active Slots']);
    expect(labels).not.toContain('Binary Cap');
    expect(labels).not.toContain('Binary Earning Cap');
  });

  it('renders the documented 60% / 40% / 41% progress toward Beacon', () => {
    const [customers, cv, slots] = FIXTURE_RANK_SNAPSHOT.requirements;
    expect(customers.progressPercent?.toFixed(0)).toBe('60');
    expect(cv.progressPercent?.toFixed(0)).toBe('40');
    expect(slots.progressPercent?.toFixed(0)).toBe('41');
  });

  it('measures each row against Beacon’s requirement, not Relay’s', () => {
    const beacon = getRankRequirements('beacon');
    const [customers, cv, slots] = FIXTURE_RANK_SNAPSHOT.requirements;
    expect(customers.required?.toString()).toBe(String(beacon?.personalCustomers));
    expect(cv.required?.equals(beacon!.weakLegCV!)).toBe(true);
    expect(slots.required?.toString()).toBe(String(beacon?.activeSlots));
  });

  it('has met nothing yet — every row is still short of Beacon', () => {
    expect(FIXTURE_RANK_SNAPSHOT.requirements.every((r) => r.met)).toBe(false);
    expect(FIXTURE_RANK_SNAPSHOT.requirements.some((r) => r.met)).toBe(false);
  });

  it('reads the binary cap off the rank, so it stays a single source of truth', () => {
    // The demo user stores no binary value; the cap is Relay's own $2,500/week.
    expect(FIXTURE_RANK_SNAPSHOT.currentRank.binaryCap.toString()).toBe('2500');
    expect(FIXTURE_RANK_SNAPSHOT.nextRank?.binaryCap.toString()).toBe('6000');
  });
});

describe('buildRankSnapshot', () => {
  it('is not flagged as fixture when every value is supplied', () => {
    const snap = buildRankSnapshot('verifier', 5, 5000, 30);
    expect(snap.isFixture).toBe(false);
    expect(snap.currentRank.id).toBe('verifier');
    expect(snap.nextRank?.id).toBe('relay');
  });

  it('is flagged as fixture when any value is missing', () => {
    expect(buildRankSnapshot('verifier', 5, 5000).isFixture).toBe(true);
    expect(buildRankSnapshot().isFixture).toBe(true);
  });

  it('marks a row met once the value reaches the next rank’s requirement', () => {
    // Beacon needs 10 customers / $25,000 CV / 110 slots.
    const snap = buildRankSnapshot('relay', 10, 25000, 110);
    expect(snap.requirements.every((r) => r.met)).toBe(true);
    expect(snap.requirements.every((r) => r.progressPercent?.toString() === '100')).toBe(true);
  });

  it('clamps progress at 100% when a value overshoots', () => {
    const snap = buildRankSnapshot('relay', 999, 999999, 9999);
    expect(snap.requirements.every((r) => r.progressPercent?.toString() === '100')).toBe(true);
  });

  it('has no next rank and no measurable requirements at Keystone', () => {
    const snap = buildRankSnapshot('keystone', 40, 400000, 1800);
    expect(snap.nextRank).toBeNull();
    expect(snap.requirements.every((r) => r.required === null)).toBe(true);
    expect(snap.requirements.every((r) => r.progressPercent === null)).toBe(true);
    expect(snap.requirements.every((r) => r.met)).toBe(false);
  });

  it('still exposes Keystone’s own binary cap at max rank', () => {
    expect(buildRankSnapshot('keystone', 40, 400000, 1800).currentRank.binaryCap.toString())
      .toBe('60000');
  });

  it('falls back to the demo rank for an unknown rank id', () => {
    expect(buildRankSnapshot('nonexistent', 1, 1, 1).currentRank.id).toBe('relay');
  });

  it('accepts Decimal, string, or number for weak-leg CV', () => {
    const fromDecimal = buildRankSnapshot('relay', 6, new Decimal('10000'), 45);
    const fromString = buildRankSnapshot('relay', 6, '10000', 45);
    const fromNumber = buildRankSnapshot('relay', 6, 10000, 45);
    for (const snap of [fromDecimal, fromString, fromNumber]) {
      expect(snap.requirements[1].current?.toString()).toBe('10000');
    }
  });
});
