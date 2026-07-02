'use client';

import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { ChevronLeft, Mail, Pencil, RefreshCw, Check, AlertTriangle } from 'lucide-react';
import { getAccount, requestEmailChange, verifyEmailChange, type AccountInfo } from '@/utils/accountApi';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  return `${local.slice(0, 2)}***@${domain}`;
}

type View = 'idle' | 'form' | 'code';

// Email Verification — view the current (masked) email, then change it with a
// real verification code sent to the NEW address. The "Are you sure" modal makes
// the user acknowledge the 24h withdrawal hold + 30d old-email block (both real).
export default function EmailVerification({ settingsPath = '/settings' }: { settingsPath?: string }) {
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [view, setView] = useState<View>('idle');
  const [modal, setModal] = useState(false);
  const [ack1, setAck1] = useState(false);
  const [ack2, setAck2] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const refresh = () => getAccount().then(setAccount).catch(() => {});
  useEffect(() => { refresh(); }, []);

  const openModal = () => { setError(null); setAck1(false); setAck2(false); setModal(true); };
  const proceed = () => { setModal(false); setNewEmail(''); setCode(''); setDone(false); setView('form'); };

  const sendCode = async () => {
    setError(null); setBusy(true);
    try { await requestEmailChange(newEmail.trim().toLowerCase()); setView('code'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const verify = async () => {
    setError(null); setBusy(true);
    try { await verifyEmailChange(code); await refresh(); setDone(true); setView('idle'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const inp = 'w-full p-3.5 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl text-sm font-mono focus:outline-none text-slate-100 placeholder-slate-600';

  return (
    <div className="flex-1 min-h-full bg-[#020617] text-slate-100 p-4 sm:p-6 lg:p-8 flex flex-col gap-5 overflow-y-auto">
      <Link href={`${settingsPath}/security`} className="self-start flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 font-semibold transition-colors">
        <ChevronLeft className="h-4 w-4" /> Security
      </Link>
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">Email Verification</h1>
      {error && <div className="text-xs font-mono text-rose-300">{error}</div>}
      {done && <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-mono font-bold"><Check className="h-4 w-4" /> Email updated.</div>}

      {/* Current email card */}
      {view === 'idle' && (
        <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Mail className="h-5 w-5 text-slate-400 shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-slate-100 truncate">{account ? maskEmail(account.email) : '…'}</span>
              {account && <span className="text-[11px] font-mono text-slate-500">Added: {new Date(account.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>}
            </div>
          </div>
          {account?.authMethod === 'google' ? (
            <span className="text-[10px] font-mono text-slate-500 shrink-0 max-w-[140px] text-right leading-tight">Managed by Google</span>
          ) : (
            <button onClick={openModal} aria-label="Change email" className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0">
              <Pencil className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Step 1 — new email */}
      {view === 'form' && (
        <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-5 flex flex-col gap-3 max-w-md">
          <label className="text-xs font-mono uppercase tracking-widest text-slate-500">New email address</label>
          <input type="email" autoComplete="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="you@example.com" className={inp} />
          <div className="flex gap-2">
            <button onClick={sendCode} disabled={busy || !newEmail.includes('@')} className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl font-bold text-xs cursor-pointer flex items-center gap-2">
              {busy && <RefreshCw className="h-3.5 w-3.5 animate-spin" />} Send verification code
            </button>
            <button onClick={() => setView('idle')} className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 font-bold text-xs cursor-pointer">Cancel</button>
          </div>
        </div>
      )}

      {/* Step 2 — code */}
      {view === 'code' && (
        <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-5 flex flex-col gap-3 max-w-md">
          <p className="text-xs text-slate-400 leading-relaxed">We sent a 6-digit code to <span className="text-slate-200 font-mono">{newEmail}</span>. Enter it to confirm.</p>
          <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" className={`${inp} tracking-[0.35em] text-center max-w-[200px]`} />
          <div className="flex gap-2">
            <button onClick={verify} disabled={busy || code.length !== 6} className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl font-bold text-xs cursor-pointer flex items-center gap-2">
              {busy && <RefreshCw className="h-3.5 w-3.5 animate-spin" />} Verify & update
            </button>
            <button onClick={sendCode} disabled={busy} className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 font-bold text-xs cursor-pointer">Resend</button>
          </div>
        </div>
      )}

      {/* Confirmation modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-[#0b1220] border border-slate-800 p-6 flex flex-col items-center gap-4 text-center shadow-2xl">
            <div className="relative">
              <Mail className="h-12 w-12 text-slate-300" />
              <AlertTriangle className="h-5 w-5 text-black bg-amber-500 rounded-full p-0.5 absolute -right-1 -bottom-1" />
            </div>
            <h2 className="text-lg font-extrabold text-white leading-snug">Are You Sure You Want to Change Your Email Address?</h2>
            <label className="flex items-start gap-3 text-left text-xs text-slate-400 leading-relaxed cursor-pointer">
              <input type="checkbox" checked={ack1} onChange={(e) => setAck1(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-500" />
              <span>Withdrawals and P2P transactions might be disabled for <span className="text-amber-400 font-bold">24 hours</span> after changing your email verification to ensure the safety of your assets.</span>
            </label>
            <label className="flex items-start gap-3 text-left text-xs text-slate-400 leading-relaxed cursor-pointer">
              <input type="checkbox" checked={ack2} onChange={(e) => setAck2(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-500" />
              <span>The old email address cannot be used to re-register for <span className="text-amber-400 font-bold">30 days</span> after updating it.</span>
            </label>
            <div className="flex gap-3 w-full mt-1">
              <button onClick={() => setModal(false)} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 font-bold text-sm cursor-pointer">Cancel</button>
              <button onClick={proceed} disabled={!ack1 || !ack2} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm cursor-pointer">Continue</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
