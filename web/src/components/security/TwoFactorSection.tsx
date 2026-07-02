'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Smartphone, Check, RefreshCw, ShieldCheck, Copy, KeyRound } from 'lucide-react';
import { get2faStatus, setup2fa, enable2fa, disable2fa } from '@/utils/accountApi';
import { copyToClipboard } from '@/utils/clipboard';

type View = 'loading' | 'off' | 'enrolling' | 'backup' | 'on';

// Real Google Authenticator (TOTP) enrollment + management. No login enforcement
// yet — that's the next step; this section is fully functional on its own.
export default function TwoFactorSection() {
  const [view, setView] = useState<View>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otpauth, setOtpauth] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [remaining, setRemaining] = useState(0);
  const [disarming, setDisarming] = useState(false);

  const refresh = () =>
    get2faStatus()
      .then((s) => { setView(s.enabled ? 'on' : 'off'); setRemaining(s.backupCodesRemaining); })
      .catch(() => setView('off'));
  useEffect(() => { refresh(); }, []);

  const startSetup = async () => {
    setError(null); setBusy(true);
    try {
      const s = await setup2fa();
      setOtpauth(s.otpauthUri); setSecret(s.secret); setCode(''); setView('enrolling');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const confirmEnable = async () => {
    setError(null); setBusy(true);
    try { const r = await enable2fa(code); setBackupCodes(r.backupCodes); setView('backup'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const doDisable = async () => {
    setError(null); setBusy(true);
    try { await disable2fa(code); setCode(''); setDisarming(false); await refresh(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const codeInput = (
    <input
      inputMode="numeric"
      autoComplete="one-time-code"
      value={code}
      onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
      placeholder="123456"
      className="w-full max-w-[180px] tracking-[0.35em] text-center p-3 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl text-sm font-mono focus:outline-none text-slate-100 placeholder-slate-600"
    />
  );

  return (
    <div className="p-5 rounded-2xl bg-slate-950/40 border border-slate-800 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-sans font-bold text-slate-100 text-sm flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-indigo-400" /> Google Authenticator
        </h3>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono border ${
          view === 'on' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' : 'bg-slate-800 text-slate-400 border-slate-700'
        }`}>
          {view === 'on' ? <><ShieldCheck className="h-3 w-3" /> Enabled</> : 'Off'}
        </span>
      </div>

      {error && <div className="text-xs font-mono text-rose-300">{error}</div>}

      {view === 'loading' && <p className="text-xs text-slate-500 font-mono">Loading…</p>}

      {/* OFF → offer setup */}
      {view === 'off' && (
        <>
          <p className="text-xs text-slate-400 leading-relaxed">
            Add a second step at login using a 6-digit code from an authenticator app (Google Authenticator, Authy, 1Password…).
          </p>
          <button onClick={startSetup} disabled={busy} className="self-start px-5 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl border border-indigo-500/20 font-bold text-xs transition-all cursor-pointer flex items-center gap-2">
            {busy && <RefreshCw className="h-3.5 w-3.5 animate-spin" />} Set up 2FA
          </button>
        </>
      )}

      {/* ENROLLING → show QR + secret + verify */}
      {view === 'enrolling' && (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-slate-400 leading-relaxed">1. Scan this QR in your authenticator app (or enter the key manually), then 2. enter the 6-digit code to confirm.</p>
          <div className="flex flex-col sm:flex-row gap-5 items-start">
            <div className="p-3 bg-white rounded-xl shrink-0"><QRCodeSVG value={otpauth} size={148} /></div>
            <div className="flex flex-col gap-2 min-w-0">
              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Manual key</span>
              <button onClick={() => copyToClipboard(secret)} className="flex items-center gap-2 text-xs font-mono text-slate-300 hover:text-white break-all text-left">
                <Copy className="h-3.5 w-3.5 shrink-0 text-slate-500" /> {secret}
              </button>
              <div className="mt-2 flex flex-col gap-2">
                {codeInput}
                <button onClick={confirmEnable} disabled={busy || code.length !== 6} className="self-start px-5 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl border border-indigo-500/20 font-bold text-xs transition-all cursor-pointer flex items-center gap-2">
                  {busy && <RefreshCw className="h-3.5 w-3.5 animate-spin" />} Verify & enable
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BACKUP → one-time codes */}
      {view === 'backup' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-mono font-bold"><Check className="h-4 w-4" /> 2FA is on. Save your backup codes.</div>
          <p className="text-xs text-slate-400 leading-relaxed">Each code works once if you lose your phone. Store them somewhere safe — they won&apos;t be shown again.</p>
          <div className="grid grid-cols-2 gap-2 p-4 rounded-xl bg-slate-950 border border-slate-800">
            {backupCodes.map((c) => <span key={c} className="font-mono text-xs text-slate-200 tracking-wide">{c}</span>)}
          </div>
          <div className="flex gap-2">
            <button onClick={() => copyToClipboard(backupCodes.join('\n'))} className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 font-bold text-xs cursor-pointer flex items-center gap-2"><Copy className="h-3.5 w-3.5" /> Copy all</button>
            <button onClick={() => refresh()} className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl border border-indigo-500/20 font-bold text-xs cursor-pointer">Done</button>
          </div>
        </div>
      )}

      {/* ON → status + disable */}
      {view === 'on' && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-slate-400 leading-relaxed flex items-center gap-2"><KeyRound className="h-3.5 w-3.5 text-slate-500" /> {remaining} backup code{remaining === 1 ? '' : 's'} remaining.</p>
          {!disarming ? (
            <button onClick={() => { setDisarming(true); setError(null); setCode(''); }} className="self-start px-5 py-3 bg-slate-800 hover:bg-rose-500/15 hover:text-rose-300 text-slate-300 rounded-xl border border-slate-700 hover:border-rose-500/30 font-bold text-xs transition-all cursor-pointer">Disable 2FA</button>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-slate-400">Enter a current 6-digit code (or a backup code) to turn off 2FA.</p>
              <input value={code} onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 12))} placeholder="123456" className="w-full max-w-[220px] p-3 bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-xl text-sm font-mono focus:outline-none text-slate-100 placeholder-slate-600" />
              <div className="flex gap-2">
                <button onClick={doDisable} disabled={busy || !code} className="px-5 py-3 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white rounded-xl font-bold text-xs cursor-pointer flex items-center gap-2">{busy && <RefreshCw className="h-3.5 w-3.5 animate-spin" />} Confirm disable</button>
                <button onClick={() => { setDisarming(false); setCode(''); setError(null); }} className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 font-bold text-xs cursor-pointer">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
