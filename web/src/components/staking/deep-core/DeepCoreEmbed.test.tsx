// @vitest-environment jsdom
//
// docs/specs/deep-core-05-screen-flow-frd.md — component-level coverage for
// the game surface's mount-gating / state-machine rendering (R-1, R-5, S-0/S-5,
// Q4's "no gear-track tab" guard). Phaser itself is mocked out via
// `next/dynamic` so this stays a fast, jsdom-only test (no WebGL/Canvas boot).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
}));

vi.mock('next/dynamic', () => ({
  default: () => function MockDeepCoreCanvas() { return null; },
}));

import DeepCoreEmbed from './DeepCoreEmbed';
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

describe('DeepCoreEmbed', () => {
  afterEach(() => { cleanup(); window.localStorage.clear(); vi.clearAllMocks(); });

  it('renders nothing while loading, or with no game state', () => {
    const { container: c1 } = render(<DeepCoreEmbed game={null} loading={false} />);
    expect(c1.firstChild).toBeNull();
    const { container: c2 } = render(<DeepCoreEmbed game={baseGame()} loading={true} />);
    expect(c2.firstChild).toBeNull();
  });

  it('AC-S2 precondition — renders nothing (no canvas box) for S0_NOT_SHOWN', () => {
    const { container } = render(<DeepCoreEmbed game={baseGame({ surfaceState: 'S0_NOT_SHOWN' })} loading={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the canvas box + HUD + 3-tab control bar for S1_RUNNING', () => {
    render(<DeepCoreEmbed game={baseGame()} loading={false} />);
    expect(screen.getByTestId('deep-core-canvas-box')).not.toBeNull();
    expect(screen.getByTestId('deep-core-hud-level')).not.toBeNull();
    expect(screen.getByTestId('deep-core-tab-crew')).not.toBeNull();
    expect(screen.getByTestId('deep-core-tab-depot')).not.toBeNull();
    expect(screen.getByTestId('deep-core-tab-ledger')).not.toBeNull();
  });

  it('never renders a Rig/gear-track tab (00 §6.5 Q4 — forbidden even as a placeholder in Phase 0)', () => {
    render(<DeepCoreEmbed game={baseGame()} loading={false} />);
    expect(screen.queryByTestId('deep-core-tab-rig')).toBeNull();
  });

  it('S5_DISABLED renders only a minimal banner, no canvas box, no HUD, no tabs', () => {
    render(<DeepCoreEmbed game={baseGame({ surfaceState: 'S5_DISABLED' })} loading={false} />);
    expect(screen.getByTestId('deep-core-disabled')).not.toBeNull();
    expect(screen.queryByTestId('deep-core-canvas-box')).toBeNull();
    expect(screen.queryByTestId('deep-core-tab-crew')).toBeNull();
  });

  it('respects the `game.pref.hide` localStorage flag — canvas box does not mount, an unhide control remains', () => {
    window.localStorage.setItem('bana.deepCore.hidden', '1');
    render(<DeepCoreEmbed game={baseGame()} loading={false} />);
    expect(screen.queryByTestId('deep-core-canvas-box')).toBeNull();
    expect(screen.getByTestId('deep-core-unhide')).not.toBeNull();
  });

  it('R-1-adjacent — the well-click callback prop is threaded through without throwing when absent', () => {
    expect(() => render(<DeepCoreEmbed game={baseGame()} loading={false} />)).not.toThrow();
  });
});
