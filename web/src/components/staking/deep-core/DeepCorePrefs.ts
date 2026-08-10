'use client';

// DEEP CORE — client-only display preferences (05 §6.7 / G-4).
// None of these affect progression: `game.pref.hideHelp` is a hard product
// requirement ("숨겨도 진행도와 지급에는 영향이 없습니다") — hiding is a pure
// render-time decision, XP/SV keep accruing server-side regardless (AC-S3).
import { useEffect, useState } from 'react';

const PREFIX = 'bana.deepCore.';

export type MotionPref = 'auto' | 'reduced' | 'static';

function read(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(PREFIX + key); } catch { return null; }
}
function write(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(PREFIX + key, value); } catch { /* ignore */ }
}

export function isHidden(): boolean {
  return read('hidden') === '1';
}

// docs/specs/staking-page-v2-screen-flow-frd.md UF-6 — B4 (the control bar,
// rendered by `Staking.tsx` as a sibling of `DeepCoreEmbed` since the B1→B4
// split) has to hide in lockstep with B1 the moment the user toggles this
// pref, in the *same* tab, without a reload. The native `storage` event only
// fires in *other* tabs, so same-tab subscribers (this module's own
// `useDeepCoreHidden()` callers) are notified explicitly via this listener
// set. Do not read/write `bana.deepCore.hidden` directly anywhere else —
// always go through `isHidden()` / `setHidden()` / `useDeepCoreHidden()` so
// every subscriber stays in sync.
const hiddenListeners = new Set<() => void>();

export function setHidden(hidden: boolean): void {
  write('hidden', hidden ? '1' : '0');
  for (const listener of hiddenListeners) listener();
}

/**
 * Shared-state hook for the `bana.deepCore.hidden` pref (05 §6.7, UF-6).
 * Both `DeepCoreEmbed` (B1's own mount gate) and `Staking.tsx` (B4's mount
 * gate) call this hook so the two can never drift apart — calling
 * `setHidden()` from either side, or toggling the pref in another browser
 * tab, re-renders every subscriber with the new value.
 *
 * Defaults to `true` before the mount effect runs: `localStorage` isn't
 * available during SSR, and defaulting to "hidden" avoids a flash of the
 * canvas/control bar for users who had it hidden, matching the pre-split
 * `DeepCoreEmbed` behavior.
 */
export function useDeepCoreHidden(): boolean {
  const [hidden, setHiddenState] = useState(true);

  useEffect(() => {
    setHiddenState(isHidden());
    const onChange = () => setHiddenState(isHidden());
    hiddenListeners.add(onChange);
    window.addEventListener('storage', onChange);
    return () => {
      hiddenListeners.delete(onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  return hidden;
}

export function getMotionPref(): MotionPref {
  const v = read('motion');
  return v === 'reduced' || v === 'static' ? v : 'auto';
}
export function setMotionPref(pref: MotionPref): void {
  write('motion', pref);
}

/** `prefers-reduced-motion` OR the explicit user setting (G-4 — either one disables particles/transitions). */
export function motionShouldBeReduced(): boolean {
  const pref = getMotionPref();
  if (pref === 'reduced' || pref === 'static') return true;
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

export function staticOnly(): boolean {
  return getMotionPref() === 'static';
}

// 05 §5.1 — the one-time, dismiss-forever intro overlay on first mount.
const INTRO_KEY = PREFIX + 'introSeen';
export function isIntroSeen(): boolean {
  if (typeof window === 'undefined') return true;
  try { return window.localStorage.getItem(INTRO_KEY) === '1'; } catch { return true; }
}
export function markIntroSeen(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(INTRO_KEY, '1'); } catch { /* ignore */ }
}

// Last chapter the user has actually seen the transition overlay for — used
// to detect "chapter went up since last visit" without a new API call (05 §4.3).
export function getLastSeenChapter(): number | null {
  const raw = read('lastSeenChapter');
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : null;
}
export function setLastSeenChapter(chapter: number): void {
  write('lastSeenChapter', String(chapter));
}
