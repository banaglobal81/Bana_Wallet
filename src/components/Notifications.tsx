import React, { useState, useRef, useEffect } from 'react';
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
  Fuel,
  X
} from 'lucide-react';

type NotifType = 'swap' | 'deposit' | 'withdraw' | 'security' | 'price' | 'staking' | 'gas';

interface NotifItem {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  ts: number; // epoch ms
  read: boolean;
}

const ICONS: Record<NotifType, React.ReactNode> = {
  swap: <ArrowLeftRight className="h-4 w-4 text-indigo-400" />,
  deposit: <Download className="h-4 w-4 text-emerald-400" />,
  withdraw: <Upload className="h-4 w-4 text-sky-400" />,
  security: <ShieldAlert className="h-4 w-4 text-amber-400" />,
  price: <TrendingUp className="h-4 w-4 text-sky-400" />,
  staking: <Coins className="h-4 w-4 text-purple-400" />,
  gas: <Fuel className="h-4 w-4 text-teal-400" />,
};

const STORAGE_KEY = 'bana_notifications_v1';

// Relative "time ago" — recomputed on each render / tick.
function relTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const TOKENS = ['ETH', 'USDC', 'LINK', 'ARB', 'PAXG'];
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const amt = (max: number, dp = 2) => (Math.random() * max).toFixed(dp);

// Pool of realistic events the feed can emit.
const POOL: Array<() => Omit<NotifItem, 'id' | 'ts' | 'read'>> = [
  () => {
    const a = pick(TOKENS), b = pick(TOKENS.filter((t) => t !== a));
    return { type: 'swap', title: 'Swap completed', body: `Swapped ${amt(3, 3)} ${a} → ${amt(2000)} ${b}.` };
  },
  () => ({ type: 'deposit', title: 'Deposit received', body: `Received ${amt(500)} ${pick(TOKENS)} into your vault.` }),
  () => ({ type: 'withdraw', title: 'Withdrawal processed', body: `Sent ${amt(1)} ${pick(TOKENS)} to an external address.` }),
  () => ({ type: 'price', title: 'Price alert', body: `${pick(TOKENS)} moved ${Math.random() > 0.5 ? '+' : '-'}${amt(8)}% in the last hour.` }),
  () => ({ type: 'staking', title: 'Staking reward', body: `Earned ${amt(0.5, 4)} ${pick(['ETH', 'ARB', 'LINK'])} in rewards.` }),
  () => ({ type: 'security', title: 'Security check', body: pick(['MEV shield blocked a sandwich attempt.', 'Firewall flagged a high-risk contract.', 'New device session verified.']) }),
  () => ({ type: 'gas', title: 'Network gas is low', body: `Gas dropped to ~${Math.floor(12 + Math.random() * 18)} Gwei — good time to transact.` }),
];

const SEED = (): NotifItem[] => {
  const now = Date.now();
  return [
    { id: 's1', type: 'security', title: 'Security check passed', body: 'Hardware wallet guard verified your session.', ts: now - 2 * 60_000, read: false },
    { id: 's2', type: 'swap', title: 'Swap completed', body: 'Swapped 0.45 ETH → 1,085.40 USDC.', ts: now - 64 * 60_000, read: false },
    { id: 's3', type: 'deposit', title: 'Deposit received', body: 'Received 122.50 ARB into your vault.', ts: now - 5 * 3_600_000, read: false },
    { id: 's4', type: 'price', title: 'Price alert', body: 'ETH is up +4.2% in the last 24h.', ts: now - 26 * 3_600_000, read: true },
    { id: 's5', type: 'staking', title: 'Staking reward', body: 'Earned 0.0184 ETH in staking rewards.', ts: now - 2 * 86_400_000, read: true },
  ];
};

const loadInitial = (): NotifItem[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch { /* ignore */ }
  return SEED();
};

export default function Notifications() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotifItem[]>(loadInitial);
  const [toast, setToast] = useState<NotifItem | null>(null);
  const [, setTick] = useState(0); // forces relative-time refresh
  const wrapRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { openRef.current = open; }, [open]);

  const unread = items.filter((n) => !n.read).length;

  // Persist to localStorage.
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 30))); } catch { /* ignore */ }
  }, [items]);

  // Refresh relative timestamps periodically.
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 20_000);
    return () => clearInterval(t);
  }, []);

  // Live feed — a new alert arrives at randomized intervals.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const emit = () => {
      const ev = pick(POOL)();
      const item: NotifItem = { ...ev, id: `live-${Date.now()}-${Math.floor(Math.random() * 1e4)}`, ts: Date.now(), read: false };
      setItems((prev) => [item, ...prev].slice(0, 30));
      // Toast only when the panel is closed (don't cover an open list).
      if (!openRef.current) {
        setToast(item);
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 5500);
      }
    };
    const schedule = () => { timer = setTimeout(() => { emit(); schedule(); }, 14_000 + Math.random() * 14_000); };
    schedule();
    return () => clearTimeout(timer);
  }, []);

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

  const markAllRead = () => setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  const markRead = (id: string) => setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  const dismiss = (id: string) => setItems((prev) => prev.filter((n) => n.id !== id));

  const openFromToast = () => {
    setToast(null);
    setOpen(true);
  };

  return (
    <div className="relative" ref={wrapRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
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
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl shadow-black/40 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">Notifications</span>
              {unread > 0 && (
                <span className="text-[10px] font-bold font-mono bg-indigo-500/15 text-indigo-300 px-1.5 py-0.5 rounded-full border border-indigo-500/20">
                  {unread} new
                </span>
              )}
            </div>
            {unread > 0 && (
              <button onClick={markAllRead} className="flex items-center gap-1 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 cursor-pointer">
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-800/60">
            {items.length === 0 ? (
              <div className="px-4 py-10 text-center text-xs font-mono text-slate-500">You're all caught up.</div>
            ) : (
              items.map((n) => (
                <div key={n.id} className={`group flex items-start gap-3 px-4 py-3 transition-colors ${n.read ? 'bg-transparent' : 'bg-indigo-500/5'} hover:bg-slate-800/40`}>
                  <div className="mt-0.5 w-8 h-8 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0">
                    {ICONS[n.type]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />}
                      <span className="text-[13px] font-semibold text-white truncate">{n.title}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{n.body}</p>
                    <span className="text-[10px] font-mono text-slate-500">{relTime(n.ts)}</span>
                  </div>
                  <div className="flex flex-col items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!n.read && (
                      <button onClick={() => markRead(n.id)} aria-label="Mark read" title="Mark read" className="p-1 text-slate-400 hover:text-emerald-400 cursor-pointer">
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button onClick={() => dismiss(n.id)} aria-label="Dismiss" title="Dismiss" className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-slate-800 text-center">
            <span className="text-[11px] font-mono text-slate-500">Live alerts will sync from Nia-Hub events</span>
          </div>
        </div>
      )}

      {/* Toast pop-up on new arrival (when panel closed) */}
      {toast && (
        <div
          onClick={openFromToast}
          className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-80 z-[60] bg-slate-900 border border-indigo-500/30 rounded-xl shadow-2xl shadow-black/50 p-3.5 flex items-start gap-3 cursor-pointer animate-[fadeInUp_0.25s_ease-out]"
          style={{ animation: 'niaToastIn 0.25s ease-out' }}
          role="status"
        >
          <div className="mt-0.5 w-8 h-8 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0">
            {ICONS[toast.type]}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-white">{toast.title}</div>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-snug truncate">{toast.body}</p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setToast(null); }}
            aria-label="Dismiss toast"
            className="p-1 text-slate-500 hover:text-white cursor-pointer shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <style>{`@keyframes niaToastIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
        </div>
      )}
    </div>
  );
}
