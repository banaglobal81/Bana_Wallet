// Shared notification-display preferences. Persisted in localStorage so they
// survive reloads, with a change event so the Notifications panel updates live
// when the toggles change in Settings (same tab) or another tab.

export type NotifCategory = 'deposit' | 'withdraw' | 'trade' | 'events';

export type NotifPrefs = Record<NotifCategory, boolean>;

export const NOTIF_CATEGORIES: { key: NotifCategory; label: string; desc: string }[] = [
  { key: 'deposit', label: 'Deposits', desc: 'Incoming deposit confirmations' },
  { key: 'withdraw', label: 'Withdrawals', desc: 'Outgoing withdrawal updates' },
  { key: 'trade', label: 'Trades', desc: 'Executed swaps / trades' },
  { key: 'events', label: 'System events', desc: 'Orders, positions, balance & risk alerts' },
];

const DEFAULTS: NotifPrefs = { deposit: true, withdraw: true, trade: true, events: true };
const KEY = 'bana_notif_prefs_v1';
const CHANGE_EVENT = 'bana-notif-prefs-changed';

/** Read prefs, falling back to all-enabled defaults (SSR-safe). */
export function getNotifPrefs(): NotifPrefs {
  if (typeof window === 'undefined') return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<NotifPrefs>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Persist a single toggle and notify listeners in this tab. */
export function setNotifPref(key: NotifCategory, value: boolean): void {
  if (typeof window === 'undefined') return;
  const next = { ...getNotifPrefs(), [key]: value };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / disabled storage */
  }
  // 'storage' only fires in OTHER tabs, so dispatch our own event for this tab.
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

/** Map a notification's type to its preference category. */
export function categoryOf(type: string): NotifCategory {
  if (type === 'deposit' || type === 'withdraw' || type === 'trade') return type;
  return 'events';
}

/** Subscribe to pref changes (same tab + cross-tab). Returns an unsubscribe fn. */
export function onNotifPrefsChange(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(); };
  window.addEventListener(CHANGE_EVENT, cb);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb);
    window.removeEventListener('storage', onStorage);
  };
}
