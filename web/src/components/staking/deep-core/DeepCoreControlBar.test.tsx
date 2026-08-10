// @vitest-environment jsdom
//
// docs/specs/staking-page-v2-screen-flow-frd.md B1→B2→B3→B4 order — the B4
// control bar (Crew/Depot/Ledger) is rendered standalone by the page layout
// now (split out of `DeepCoreEmbed`'s B1 canvas tree, see DeepCoreEmbed.tsx).
// This covers the two exports a caller needs to do that:
// `DeepCoreControlBar` itself and `deriveDeepCoreCrewState`.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
}));

import { DeepCoreControlBar, deriveDeepCoreCrewState } from './DeepCoreEmbed';
import type { DeepCoreGameState } from '@/utils/stakingApi';

function baseGame(overrides: Partial<DeepCoreGameState> = {}): DeepCoreGameState {
  return {
    surfaceState: 'S1_RUNNING',
    xp: { level: 3, xpIntoLevel: 5, xpForNextLevel: 25, xpTotal: 40 },
    chapter: 1,
    crew: ['crew_boss'],
    cosmeticSlots: [],
    depotUnlocked: true,
    operatingDays: 5,
    coreLogRank: 0,
    svEarned: 0,
    wells: [],
    activeWellCount: 1,
    lastLiftAt: null,
    xpBreakdown: { lift: 0, charterOpen: 40, charterComplete: 0 },
    svBreakdown: { stratum: 0, charterComplete: 0, coreLog: 0 },
    ...overrides,
  };
}

describe('DeepCoreControlBar (standalone, B4)', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('renders the 3 tabs (crew/depot/ledger) and never a Rig/gear-track tab (00 §6.5 Q4)', () => {
    const game = baseGame();
    render(<DeepCoreControlBar game={game} crewState={deriveDeepCoreCrewState(game)} />);
    expect(screen.getByTestId('deep-core-tab-crew')).not.toBeNull();
    expect(screen.getByTestId('deep-core-tab-depot')).not.toBeNull();
    expect(screen.getByTestId('deep-core-tab-ledger')).not.toBeNull();
    expect(screen.queryByTestId('deep-core-tab-rig')).toBeNull();
  });
});

describe('deriveDeepCoreCrewState', () => {
  it('returns {} for null game', () => {
    expect(deriveDeepCoreCrewState(null)).toEqual({});
  });

  it('deep-core-01-world-bible.md §4.3 — S2_REPORTING_PAUSED beats idle/working', () => {
    const game = baseGame({ surfaceState: 'S2_REPORTING_PAUSED', activeWellCount: 0, crew: ['crew_boss', 'crew_scout'] });
    expect(deriveDeepCoreCrewState(game)).toEqual({ crew_boss: 'waiting', crew_scout: 'waiting' });
  });

  it('§4.3 — idle_empty when no reporting pause but activeWellCount is 0', () => {
    const game = baseGame({ activeWellCount: 0, crew: ['crew_boss'] });
    expect(deriveDeepCoreCrewState(game)).toEqual({ crew_boss: 'idle_empty' });
  });

  it('§4.3 — working by default', () => {
    const game = baseGame({ activeWellCount: 2, crew: ['crew_boss'] });
    expect(deriveDeepCoreCrewState(game)).toEqual({ crew_boss: 'working' });
  });
});
