'use client';

import { useEffect, useState } from 'react';
import { Fingerprint, RefreshCw, Trash2, Plus, ShieldCheck } from 'lucide-react';
import { listPasskeys, deletePasskey, registerPasskey, passkeysSupported, type PasskeyInfo } from '@/utils/passkeysApi';

// Passkeys (Biometrics) — real WebAuthn. Register Face ID / fingerprint / security
// keys, and manage the registered devices ("My devices"). Styled as a Manage row.
export default function PasskeysSection() {
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<PasskeyInfo[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = passkeysSupported();

  const refresh = () => listPasskeys().then(setItems).catch(() => setItems([]));
  useEffect(() => { refresh(); }, []);

  const on = (items?.length ?? 0) > 0;

  const add = async () => {
    setError(null); setBusy(true);
    try { await registerPasskey(name.trim() || 'Passkey'); setName(''); await refresh(); }
    catch (e) {
      const msg = (e as Error).message || '';
      setError(/NotAllowed|abort|timed out/i.test(msg) ? 'Registration was cancelled or timed out.' : msg);
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    setError(null);
    try { await deletePasskey(id); await refresh(); } catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="p-5 rounded-2xl bg-slate-950/40 border border-slate-800 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <Fingerprint className="h-5 w-5 text-indigo-400 mt-0.5 shrink-0" />
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="font-bold text-slate-100 text-sm">Passkeys (Biometrics)</span>
            <p className="text-xs text-slate-400 leading-relaxed">
              Protect your account and withdrawals with Passkeys and/or security keys, such as Yubikey.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="flex items-center gap-1.5 text-xs font-bold">
            <span className={`h-2 w-2 rounded-full ${on ? 'bg-emerald-400' : 'bg-slate-600'}`} />
            <span className={on ? 'text-emerald-400' : 'text-slate-500'}>{on ? 'On' : 'Off'}</span>
          </span>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold transition-colors cursor-pointer"
          >
            {expanded ? 'Close' : 'Manage'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="flex flex-col gap-3 pt-2 border-t border-slate-800/70">
          {error && <div className="text-xs font-mono text-rose-300">{error}</div>}

          {!supported ? (
            <p className="text-xs text-amber-400/90 leading-relaxed">
              This browser/device doesn&apos;t support passkeys. Try a modern browser on a device with Face ID, fingerprint, or a security key.
            </p>
          ) : (
            <>
              {/* Add a new passkey */}
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 40))}
                  placeholder="Device name (e.g. My iPhone)"
                  className="flex-1 p-3 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl text-xs font-mono focus:outline-none text-slate-200 placeholder-slate-600"
                />
                <button
                  onClick={add}
                  disabled={busy}
                  className="px-4 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl border border-indigo-500/20 font-bold text-xs transition-all cursor-pointer flex items-center gap-2 justify-center"
                >
                  {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add passkey
                </button>
              </div>

              {/* My devices */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">My devices</span>
                {items === null ? (
                  <p className="text-xs text-slate-500 font-mono">Loading…</p>
                ) : items.length === 0 ? (
                  <p className="text-xs text-slate-500">No passkeys yet. Add one above.</p>
                ) : (
                  items.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="flex items-center gap-2 min-w-0">
                        <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                        <span className="flex flex-col min-w-0">
                          <span className="text-xs font-bold text-slate-200 truncate">{p.deviceName || 'Passkey'}</span>
                          <span className="text-[10px] font-mono text-slate-500">Added {new Date(p.createdAt).toLocaleDateString()}</span>
                        </span>
                      </div>
                      <button onClick={() => remove(p.id)} aria-label="Remove device" className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
