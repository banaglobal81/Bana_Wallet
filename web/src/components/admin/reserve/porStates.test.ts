import { describe, it, expect } from 'vitest';
import { derivePorDisplayState } from './porStates';

describe('derivePorDisplayState (A-8 §6.1.1 priority order)', () => {
  it('AC-1: no run at all -> NEVER_RUN, never PASS', () => {
    expect(derivePorDisplayState({ sectionStatus: 'OK', latestRun: null, isStale: false })).toBe('NEVER_RUN');
  });

  it('AC-2: NO_RESERVE_BASIS -> UNCONFIGURED, never PASS', () => {
    expect(
      derivePorDisplayState({ sectionStatus: 'OK', latestRun: { result: 'NO_RESERVE_BASIS' }, isStale: false }),
    ).toBe('UNCONFIGURED');
  });

  it('AC-3: PASS + stale -> STALE', () => {
    expect(derivePorDisplayState({ sectionStatus: 'OK', latestRun: { result: 'PASS' }, isStale: true })).toBe(
      'STALE',
    );
  });

  it('AC-4: FAIL + stale -> FAIL wins (priority order)', () => {
    expect(derivePorDisplayState({ sectionStatus: 'OK', latestRun: { result: 'FAIL' }, isStale: true })).toBe(
      'FAIL',
    );
  });

  it('AC-5: QUERY_FAILED never renders as FAIL', () => {
    expect(
      derivePorDisplayState({ sectionStatus: 'OK', latestRun: { result: 'QUERY_FAILED' }, isStale: false }),
    ).toBe('QUERY_FAILED');
  });

  it('INCOMPLETE renders distinctly from PASS/FAIL', () => {
    expect(derivePorDisplayState({ sectionStatus: 'OK', latestRun: { result: 'INCOMPLETE' }, isStale: false })).toBe(
      'INCOMPLETE',
    );
  });

  it('fresh PASS -> PASS', () => {
    expect(derivePorDisplayState({ sectionStatus: 'OK', latestRun: { result: 'PASS' }, isStale: false })).toBe(
      'PASS',
    );
  });

  it('section UNAVAILABLE always wins, regardless of latestRun', () => {
    expect(
      derivePorDisplayState({ sectionStatus: 'UNAVAILABLE', latestRun: { result: 'PASS' }, isStale: false }),
    ).toBe('UNAVAILABLE');
  });
});
