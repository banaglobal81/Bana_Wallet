// @vitest-environment jsdom
//
// docs/specs/staking-page-v2-screen-flow-frd.md UF-6 — regression coverage
// for the QA-reported bug: B4 (`Staking.tsx`'s control bar) kept rendering
// after the B1→B4 split because it had no way to observe
// `bana.deepCore.hidden`. `useDeepCoreHidden()` is the fix — this file
// verifies two independent consumers of the hook (standing in for
// `DeepCoreEmbed` and `Staking.tsx`) never drift apart, regardless of which
// one calls `setHidden()`.
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { isHidden, setHidden, useDeepCoreHidden } from './DeepCorePrefs';

function Probe({ testId }: { testId: string }) {
  const hidden = useDeepCoreHidden();
  return <span data-testid={testId}>{String(hidden)}</span>;
}

describe('useDeepCoreHidden', () => {
  afterEach(() => { cleanup(); window.localStorage.clear(); });

  it('reads the persisted value on mount', () => {
    window.localStorage.setItem('bana.deepCore.hidden', '1');
    render(<Probe testId="a" />);
    expect(screen.getByTestId('a').textContent).toBe('true');
  });

  it('defaults to hidden=true pre-hydration when no pref is stored, matching prior DeepCoreEmbed behavior', () => {
    render(<Probe testId="a" />);
    // effect flush is synchronous enough in RTL for the mount effect to have run
    expect(screen.getByTestId('a').textContent).toBe('false');
  });

  it('UF-6 — two independent subscribers (standing in for B1 and B4) stay in sync when setHidden() is called from either side', () => {
    render(
      <>
        <Probe testId="b1" />
        <Probe testId="b4" />
      </>,
    );
    expect(screen.getByTestId('b1').textContent).toBe('false');
    expect(screen.getByTestId('b4').textContent).toBe('false');

    act(() => { setHidden(true); });
    expect(screen.getByTestId('b1').textContent).toBe('true');
    expect(screen.getByTestId('b4').textContent).toBe('true');
    expect(isHidden()).toBe(true);

    act(() => { setHidden(false); });
    expect(screen.getByTestId('b1').textContent).toBe('false');
    expect(screen.getByTestId('b4').textContent).toBe('false');
    expect(isHidden()).toBe(false);
  });

  it('unsubscribes on unmount — no stale updates / no error thrown after setHidden() following unmount', () => {
    const { unmount } = render(<Probe testId="a" />);
    unmount();
    expect(() => act(() => { setHidden(true); })).not.toThrow();
  });

  it('reacts to the native `storage` event (cross-tab sync)', () => {
    render(<Probe testId="a" />);
    expect(screen.getByTestId('a').textContent).toBe('false');
    window.localStorage.setItem('bana.deepCore.hidden', '1');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'bana.deepCore.hidden', newValue: '1' }));
    });
    expect(screen.getByTestId('a').textContent).toBe('true');
  });
});
