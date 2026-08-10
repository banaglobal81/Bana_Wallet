// DEEP CORE — client-only display preferences (05 §6.7 / G-4).
// None of these affect progression: `game.pref.hideHelp` is a hard product
// requirement ("숨겨도 진행도와 지급에는 영향이 없습니다") — hiding is a pure
// render-time decision, XP/SV keep accruing server-side regardless (AC-S3).
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
export function setHidden(hidden: boolean): void {
  write('hidden', hidden ? '1' : '0');
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
