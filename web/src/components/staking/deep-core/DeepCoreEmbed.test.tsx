// @vitest-environment jsdom
//
// docs/specs/deep-core-05-screen-flow-frd.md — component-level coverage for
// the game surface's mount-gating / state-machine rendering (R-1, R-5, S-0/S-5,
// Q4's "no gear-track tab" guard). Phaser itself is mocked out via
// `next/dynamic` so this stays a fast, jsdom-only test (no WebGL/Canvas boot).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

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

  it('renders the canvas box + HUD for S1_RUNNING', () => {
    render(<DeepCoreEmbed game={baseGame()} loading={false} />);
    expect(screen.getByTestId('deep-core-canvas-box')).not.toBeNull();
    expect(screen.getByTestId('deep-core-hud-level')).not.toBeNull();
  });

  // staking-page-v2-screen-flow-frd.md B1→B2→B3→B4 order — the B4 control
  // bar (Crew/Depot/Ledger) is a sibling insertion point rendered by the
  // page layout via the `DeepCoreControlBar` + `deriveDeepCoreCrewState`
  // exports (see DeepCoreControlBar.test.tsx), not bundled into this tree
  // anymore, so it must never appear inside `DeepCoreEmbed`'s own output.
  it('never renders the B4 control bar tabs itself — that is a separate insertion point now', () => {
    render(<DeepCoreEmbed game={baseGame()} loading={false} />);
    expect(screen.queryByTestId('deep-core-tab-crew')).toBeNull();
    expect(screen.queryByTestId('deep-core-tab-depot')).toBeNull();
    expect(screen.queryByTestId('deep-core-tab-ledger')).toBeNull();
    expect(screen.queryByTestId('deep-core-tab-rig')).toBeNull();
  });

  it('S5_DISABLED renders only a minimal banner, no canvas box, no HUD', () => {
    render(<DeepCoreEmbed game={baseGame({ surfaceState: 'S5_DISABLED' })} loading={false} />);
    expect(screen.getByTestId('deep-core-disabled')).not.toBeNull();
    expect(screen.queryByTestId('deep-core-canvas-box')).toBeNull();
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

  it('CH-2 — accepts focusWellId without throwing when absent or set', () => {
    expect(() => render(<DeepCoreEmbed game={baseGame()} loading={false} focusWellId={null} />)).not.toThrow();
    cleanup();
    expect(() => render(<DeepCoreEmbed game={baseGame()} loading={false} focusWellId="pos-1" />)).not.toThrow();
  });

  it('CH-1 — the empty-rig HUD CTA calls onOpenStake instead of scrolling when provided', () => {
    const onOpenStake = vi.fn();
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    render(<DeepCoreEmbed game={baseGame({ surfaceState: 'S4_IDLE_RIG', activeWellCount: 0 })} loading={false} onOpenStake={onOpenStake} />);
    fireEvent.click(screen.getByTestId('deep-core-empty-cta'));
    expect(onOpenStake).toHaveBeenCalledTimes(1);
    expect(scrollSpy).not.toHaveBeenCalled();
  });

  // T-12 ruling §3 (EG-T9-3/EG-T9-5) — this test used to assert a scroll
  // fallback to `#staking-earn-section`, an element that has never existed
  // anywhere in `web/src` (confirmed by full-tree grep) — the fallback was a
  // guaranteed dead click, not a safety net, and has been removed outright.
  // Inverted per the ruling's own instruction: when `onOpenStake` is absent,
  // no CTA renders at all (not "renders and does something else").
  it('CH-1 — the empty-rig HUD CTA does not render when onOpenStake is absent (no scroll fallback)', () => {
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    render(<DeepCoreEmbed game={baseGame({ surfaceState: 'S4_IDLE_RIG', activeWellCount: 0 })} loading={false} />);
    expect(screen.queryByTestId('deep-core-empty-cta')).toBeNull();
    expect(scrollSpy).not.toHaveBeenCalled();
  });
});
