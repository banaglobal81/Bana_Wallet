'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  Bell,
  Check,
  CheckCheck,
  ArrowLeftRight,
  Download,
  Upload,
  ShieldAlert,
  TrendingUp,
  Coins,
  X,
  RefreshCw,
} from 'lucide-react';
import {
  getNiaNotifications,
  getNiaDeposits,
  getNiaWithdrawals,
  getNiaTrades,
} from '../utils/niaApi';
import {
  getNotifPrefs,
  onNotifPrefsChange,
  categoryOf,
  type NotifPrefs,
} from '../utils/notifPrefs';

// NotifType is the unified set used for icon/color mapping.
// 'order_update' | 'position_update' | 'balance_update' | 'liquidation_warning'
// come from webhook events; 'deposit' | 'withdraw' | 'trade' are derived from
// their respective history endpoints.
type NotifType =
  | 'deposit'
  | 'withdraw'
  | 'trade'
  | 'order_update'
  | 'position_update'
  | 'balance_update'
  | 'liquidation_warning'
  | 'event';

interface NotifItem {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  ts: number; // epoch ms
  read: boolean;
}

// ---- Icon map ----------------------------------------------------------------
const ICONS: Record<NotifType, React.ReactNode> = {
  deposit: <Download className="h-4 w-4 text-emerald-400" />,
  withdraw: <Upload className="h-4 w-4 text-sky-400" />,
  trade: <ArrowLeftRight className="h-4 w-4 text-indigo-400" />,
  order_update: <TrendingUp className="h-4 w-4 text-sky-400" />,
  position_update: <Coins className="h-4 w-4 text-purple-400" />,
  balance_update: <Coins className="h-4 w-4 text-teal-400" />,
  liquidation_warning: <ShieldAlert className="h-4 w-4 text-amber-400" />,
  event: <Bell className="h-4 w-4 text-slate-400" />,
};

// ---- Storage keys ------------------------------------------------------------
// We no longer persist full notification objects (they are re-derived from live
// data on every load). We only persist the set of read ids.
const READ_KEY = 'bana_notifications_read_v1';

function loadReadIds(): Set<string> {
  if (typeof window === 'undefined') return new Set<string>(); // SSR guard
  try {
    const raw = localStorage.getItem(READ_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set<string>(parsed);
    }
  } catch { /* ignore */ }
  return new Set<string>();
}

function saveReadIds(ids: Set<string>): void {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(Array.from(ids)));
  } catch { /* ignore */ }
}

// Translation function type (next-intl scoped translator for the 'notifications' namespace).
type T = ReturnType<typeof useTranslations>;

// ---- Relative-time helper ----------------------------------------------------
function relTime(ts: number, t: T): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 10) return t('justNow');
  if (s < 60) return t('secondsAgo', { count: s });
  const m = Math.floor(s / 60);
  if (m < 60) return t('minutesAgo', { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('hoursAgo', { count: h });
  const d = Math.floor(h / 24);
  return t('daysAgo', { count: d });
}

// ---- Mappers -----------------------------------------------------------------

function mapWebhookEvent(ev: any, readIds: Set<string>, t: T): NotifItem {
  const id = `evt-${ev.id ?? ev.ts ?? String(Date.now())}`;
  const ts: number = typeof ev.ts === 'number' ? ev.ts : Date.parse(ev.ts) || Date.now();
  const rawType: string = ev.type ?? 'event';
  const data: any = ev.data ?? {};

  // Resolve to a mapped NotifType, falling back to 'event'.
  const knownTypes: NotifType[] = [
    'deposit', 'withdraw', 'trade',
    'order_update', 'position_update', 'balance_update', 'liquidation_warning',
  ];
  const type: NotifType = (knownTypes.includes(rawType as NotifType)
    ? rawType as NotifType
    : 'event');

  let title: string;
  let body: string;

  switch (type) {
    case 'balance_update':
      title = t('balanceUpdated');
      body = data.currency
        ? `${data.currency}${data.changeAmount != null ? ' · change: ' + String(data.changeAmount) : ''}`
        : t('walletBalanceChanged');
      break;
    case 'order_update':
      title = t('orderTitle', { status: data.status ?? t('orderUpdated') });
      body = data.symbol
        ? `${data.symbol}${data.side ? ' ' + data.side : ''}${data.price != null ? ' @ ' + String(data.price) : ''}`
        : t('orderUpdatedBody');
      break;
    case 'position_update':
      title = t('positionUpdated');
      body = data.symbol
        ? `${data.symbol}${data.size != null ? ' · size: ' + String(data.size) : ''}`
        : t('positionChanged');
      break;
    case 'liquidation_warning':
      title = t('liquidationRisk');
      body = data.symbol
        ? `${data.symbol}${data.marginRatio != null ? ' · margin ratio: ' + String(data.marginRatio) : ''}`
        : t('liquidationBody');
      break;
    case 'deposit':
      title = t('depositEvent');
      body = data.amount != null && data.currency
        ? `+${String(data.amount)} ${data.currency}${data.network ? ' · ' + data.network : ''}`
        : t('depositEventReceived');
      break;
    case 'withdraw':
      title = t('withdrawalEvent');
      body = data.amount != null && data.currency
        ? `-${String(data.amount)} ${data.currency}`
        : t('withdrawalEventReceived');
      break;
    default:
      title = rawType.replace(/_/g, ' ');
      body = data.message ?? data.description ?? JSON.stringify(data).slice(0, 80);
      break;
  }

  return { id, type, title, body, ts, read: readIds.has(id) };
}

function mapDeposit(dep: any, readIds: Set<string>, t: T): NotifItem {
  const rawId: string = dep.id ?? dep.txHash ?? String(dep.createdAt);
  const id = `dep-${rawId}`;
  const ts: number = dep.createdAt ? Date.parse(dep.createdAt) : Date.now();
  const status: string = dep.status ?? '';
  const title = `${t('deposit')} ${status}`.trim();
  const currency: string = dep.currency ?? '';
  const network: string = dep.network ?? '';
  const amount: string = dep.amount != null ? String(dep.amount) : '';
  const body = amount
    ? `+${amount} ${currency}${network ? ' · ' + network : ''}`.trim()
    : currency || t('depositRecord');
  return { id, type: 'deposit', title, body, ts, read: readIds.has(id) };
}

function mapWithdrawal(wd: any, readIds: Set<string>, t: T): NotifItem {
  const rawId: string = wd.id ?? wd.withdrawalId ?? wd.txHash ?? String(wd.createdAt);
  const id = `wd-${rawId}`;
  const ts: number = wd.createdAt ? Date.parse(wd.createdAt) : Date.now();
  const status: string = wd.status ?? '';
  const title = `${t('withdrawal')} ${status}`.trim();
  const currency: string = wd.currency ?? '';
  const amount: string = wd.amount != null ? String(wd.amount) : '';
  const toAddress: string = wd.toAddress ?? wd.address ?? '';
  const addrShort = toAddress.length > 10
    ? `${toAddress.slice(0, 6)}…${toAddress.slice(-4)}`
    : toAddress;
  const body = amount
    ? `-${amount} ${currency}${addrShort ? ' · to ' + addrShort : ''}`.trim()
    : currency || t('withdrawalRecord');
  return { id, type: 'withdraw', title, body, ts, read: readIds.has(id) };
}

function mapTrade(trade: any, readIds: Set<string>, t: T): NotifItem {
  const rawId: string = trade.id ?? trade.orderId ?? trade.tradeId ?? String(trade.createdAt ?? trade.ts);
  const id = `trade-${rawId}`;
  // Timestamps: prefer ISO createdAt, fall back to numeric ts, then Date.now() only if truly absent.
  let ts: number;
  if (trade.createdAt) {
    ts = Date.parse(trade.createdAt);
  } else if (typeof trade.ts === 'number') {
    ts = trade.ts;
  } else if (typeof trade.ts === 'string') {
    ts = Date.parse(trade.ts);
  } else {
    ts = Date.now();
  }
  const symbol: string = trade.symbol ?? '';
  const side: string = trade.side ?? '';
  const price: string = trade.price != null ? String(trade.price) : '';
  const qty: string = trade.quantity != null
    ? String(trade.quantity)
    : trade.qty != null
      ? String(trade.qty)
      : '';
  const parts: string[] = [];
  if (symbol) parts.push(symbol);
  if (side) parts.push(side.toUpperCase());
  if (qty) parts.push(qty);
  if (price) parts.push('@ ' + price);
  const body = parts.length ? parts.join(' · ') : t('tradeExecutedBody');
  return { id, type: 'trade', title: t('tradeExecuted'), body, ts, read: readIds.has(id) };
}

// ---- Merge & dedup -----------------------------------------------------------
function mergeItems(
  events: any[],
  deposits: any[],
  withdrawals: any[],
  trades: any[],
  readIds: Set<string>,
  t: T,
): NotifItem[] {
  const seen = new Set<string>();
  const all: NotifItem[] = [];

  for (const ev of events) {
    const item = mapWebhookEvent(ev, readIds, t);
    if (!seen.has(item.id)) { seen.add(item.id); all.push(item); }
  }
  for (const dep of deposits) {
    const item = mapDeposit(dep, readIds, t);
    if (!seen.has(item.id)) { seen.add(item.id); all.push(item); }
  }
  for (const wd of withdrawals) {
    const item = mapWithdrawal(wd, readIds, t);
    if (!seen.has(item.id)) { seen.add(item.id); all.push(item); }
  }
  for (const trade of trades) {
    const item = mapTrade(trade, readIds, t);
    if (!seen.has(item.id)) { seen.add(item.id); all.push(item); }
  }

  // Sort newest first, cap at 50.
  all.sort((a, b) => b.ts - a.ts);
  return all.slice(0, 50);
}

// ---- Component ---------------------------------------------------------------
const POLL_MS = 25_000;

export default function Notifications() {
  const t = useTranslations('notifications');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Start empty so server and first client render match (no hydration mismatch);
  // hydrate read ids from localStorage after mount.
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set<string>());
  const [hydrated, setHydrated] = useState(false);
  const [, setTick] = useState(0); // forces relative-time refresh
  // Display preferences (which categories to show). Start with all-enabled
  // defaults so SSR and first client render match; sync from storage after mount.
  const [prefs, setPrefs] = useState<NotifPrefs>({ deposit: true, withdraw: true, trade: true, events: true });
  const wrapRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);

  useEffect(() => { openRef.current = open; }, [open]);

  // Client-only: load persisted read ids and drop the legacy full-item store.
  useEffect(() => {
    try { localStorage.removeItem('bana_notifications_v1'); } catch { /* ignore */ }
    setReadIds(loadReadIds());
    setHydrated(true);
  }, []);

  // Persist read ids whenever they change (after the initial hydration load).
  useEffect(() => { if (hydrated) saveReadIds(readIds); }, [readIds, hydrated]);

  // Refresh relative timestamps every 20s.
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 20_000);
    return () => clearInterval(t);
  }, []);

  // Fetch all four data sources and merge into unified NotifItem list.
  const fetchAll = useCallback(async () => {
    try {
      const [events, deposits, withdrawals, trades] = await Promise.all([
        getNiaNotifications(50),
        getNiaDeposits(),
        getNiaWithdrawals(),
        getNiaTrades(),
      ]);
      // Read the latest persisted read ids from state (captured by closure) to
      // correctly mark items; use a functional update so we always see latest.
      setReadIds((currentReadIds) => {
        setItems(mergeItems(events, deposits, withdrawals, trades, currentReadIds, t));
        return currentReadIds; // unchanged
      });
    } catch {
      // On error: leave existing items intact; don't clear them.
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Mount fetch + poll every 25s.
  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, POLL_MS);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // Keep items in sync when readIds changes (mark read across the board).
  useEffect(() => {
    setItems((prev) =>
      prev.map((n) => ({ ...n, read: readIds.has(n.id) })),
    );
  }, [readIds]);

  // Sync display preferences from storage after mount, and live on change.
  useEffect(() => {
    setPrefs(getNotifPrefs());
    return onNotifPrefsChange(() => setPrefs(getNotifPrefs()));
  }, []);

  // Only show categories the user has enabled.
  const visibleItems = items.filter((n) => prefs[categoryOf(n.type)]);
  const unread = visibleItems.filter((n) => !n.read).length;

  // Close panel on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markAllRead = () =>
    setReadIds((prev) => {
      const next = new Set(prev);
      items.forEach((n) => next.add(n.id));
      return next;
    });

  const markRead = (id: string) =>
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

  const dismiss = (id: string) =>
    setItems((prev) => prev.filter((n) => n.id !== id));

  return (
    <div className="relative" ref={wrapRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t('ariaLabel')}
        aria-expanded={open}
        className="p-2 bg-slate-900/60 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors cursor-pointer relative"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center text-[9px] font-bold bg-red-500 text-white rounded-full ring-2 ring-slate-950 animate-pulse">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl shadow-black/40 z-[100] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">{t('header')}</span>
              {unread > 0 && (
                <span className="text-[10px] font-bold font-mono bg-indigo-500/15 text-indigo-300 px-1.5 py-0.5 rounded-full border border-indigo-500/20">
                  {t('unreadBadge', { count: unread })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {loading && (
                <RefreshCw className="h-3.5 w-3.5 text-slate-500 animate-spin" />
              )}
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 cursor-pointer"
                >
                  <CheckCheck className="h-3.5 w-3.5" /> {t('markAllRead')}
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-800/60">
            {loading && visibleItems.length === 0 ? (
              <div className="px-4 py-10 text-center text-xs font-mono text-slate-500">
                {t('loading')}
              </div>
            ) : visibleItems.length === 0 ? (
              <div className="px-4 py-10 text-center text-xs font-mono text-slate-500">
                {items.length === 0 ? t('noNotifications') : t('noMatchPreferences')}
              </div>
            ) : (
              visibleItems.map((n) => (
                <div
                  key={n.id}
                  className={`group flex items-start gap-3 px-4 py-3 transition-colors ${n.read ? 'bg-transparent' : 'bg-indigo-500/5'} hover:bg-slate-800/40`}
                >
                  <div className="mt-0.5 w-8 h-8 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0">
                    {ICONS[n.type] ?? ICONS.event}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />}
                      <span className="text-[13px] font-semibold text-white truncate">{n.title}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{n.body}</p>
                    <span className="text-[10px] font-mono text-slate-500">{relTime(n.ts, t)}</span>
                  </div>
                  <div className="flex flex-col items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!n.read && (
                      <button
                        onClick={() => markRead(n.id)}
                        aria-label={t('markRead')}
                        title={t('markRead')}
                        className="p-1 text-slate-400 hover:text-emerald-400 cursor-pointer"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => dismiss(n.id)}
                      aria-label={t('dismiss')}
                      title={t('dismiss')}
                      className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-slate-800 text-center">
            <span className="text-[11px] font-mono text-slate-500">
              {t('footer')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
