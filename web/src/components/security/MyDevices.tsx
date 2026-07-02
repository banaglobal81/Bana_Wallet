'use client';

import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { ChevronLeft, Monitor, RefreshCw } from 'lucide-react';
import { listSessions, revokeSession, type DeviceSession } from '@/utils/sessionsApi';

// "My Devices" — the user's active login sessions (device, last login, location,
// IP), with per-session log-out. Real data; "New" tags sessions from the last 7d.
export default function MyDevices({ settingsPath = '/settings' }: { settingsPath?: string }) {
  const [rows, setRows] = useState<DeviceSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = () => listSessions().then(setRows).catch((e) => { setError((e as Error).message); setRows([]); });
  useEffect(() => { refresh(); }, []);

  const logOut = async (id: string) => {
    setError(null); setBusyId(id);
    try { await revokeSession(id); await refresh(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusyId(null); }
  };

  const location = (s: DeviceSession) => [s.city, s.country].filter(Boolean).join(' ') || 'Unknown';
  const isNew = (iso: string) => Date.now() - new Date(iso).getTime() < 7 * 24 * 60 * 60 * 1000;
  const fmt = (iso: string) => new Date(iso).toISOString().slice(0, 19).replace('T', ' ');

  return (
    <div className="flex-1 min-h-full bg-[#020617] text-slate-100 p-4 sm:p-6 lg:p-8 flex flex-col gap-5 overflow-y-auto">
      <Link href={`${settingsPath}/security`} className="self-start flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 font-semibold transition-colors">
        <ChevronLeft className="h-4 w-4" /> Security
      </Link>

      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">My Devices</h1>
      {error && <div className="text-xs font-mono text-rose-300">{error}</div>}

      <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
        {/* Header (desktop) */}
        <div className="hidden md:grid grid-cols-[2fr_1.3fr_1.3fr_1.2fr_0.7fr] gap-4 px-5 py-3 border-b border-slate-800 text-[11px] font-mono uppercase tracking-widest text-slate-500">
          <span>Device</span><span>Last login</span><span>Location</span><span>IP address</span><span className="text-right">Action</span>
        </div>

        {rows === null ? (
          <p className="px-5 py-8 text-xs font-mono text-slate-500 flex items-center gap-2"><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading…</p>
        ) : rows.length === 0 ? (
          <p className="px-5 py-8 text-xs font-mono text-slate-500">No active sessions.</p>
        ) : (
          rows.map((s) => (
            <div key={s.id} className="grid grid-cols-1 md:grid-cols-[2fr_1.3fr_1.3fr_1.2fr_0.7fr] gap-1 md:gap-4 px-5 py-4 border-b border-slate-800/60 last:border-0 md:items-center">
              <div className="flex items-start gap-3 min-w-0">
                <Monitor className="h-5 w-5 text-slate-500 mt-0.5 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-bold text-slate-100 flex items-center gap-2 flex-wrap">
                    {s.device}
                    {isNew(s.createdAt) && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500 text-black">New</span>}
                  </span>
                  {s.current && <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">● Current Device</span>}
                </div>
              </div>
              <span className="text-xs font-mono text-slate-400 md:text-sm"><span className="md:hidden text-slate-600 mr-2">Last login:</span>{fmt(s.createdAt)}</span>
              <span className="text-xs text-slate-400 md:text-sm"><span className="md:hidden text-slate-600 mr-2">Location:</span>{location(s)}</span>
              <span className="text-xs font-mono text-slate-400"><span className="md:hidden text-slate-600 mr-2">IP:</span>{s.ip || '—'}</span>
              <span className="md:text-right mt-1 md:mt-0">
                {s.current ? (
                  <span className="text-xs text-slate-600" />
                ) : (
                  <button onClick={() => logOut(s.id)} disabled={busyId === s.id} className="text-xs font-bold text-amber-500 hover:text-amber-400 disabled:opacity-50 transition-colors cursor-pointer inline-flex items-center gap-1.5">
                    {busyId === s.id && <RefreshCw className="h-3 w-3 animate-spin" />} Log Out
                  </button>
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
