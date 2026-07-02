'use client';

import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { ArrowLeft, ShieldCheck, Lock, RefreshCw, Check, MonitorSmartphone, ChevronRight, Mail } from 'lucide-react';
import { getAccount, changePassword, type AccountInfo } from '@/utils/accountApi';
import TwoFactorSection from './TwoFactorSection';
import PasskeysSection from './PasskeysSection';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return domain ? `${local.slice(0, 2)}***@${domain}` : email;
}

// Dedicated Security page — reached from Settings → Security. Holds account
// protection: password (or Google note), and (built out for real next) Google
// Authenticator 2FA, biometric passkeys, and registered devices.
export default function SecurityCenter({ settingsPath = '/settings' }: { settingsPath?: string }) {
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSubmitting, setPwSubmitting] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  useEffect(() => { getAccount().then(setAccount).catch(() => {}); }, []);

  const handleChangePassword = async () => {
    setPwError(null); setPwSuccess(false);
    if (newPw.length < 8) { setPwError('Password must be at least 8 characters.'); return; }
    if (newPw !== confirmPw) { setPwError('Passwords do not match.'); return; }
    setPwSubmitting(true);
    try {
      await changePassword(curPw, newPw);
      setPwSuccess(true); setCurPw(''); setNewPw(''); setConfirmPw('');
    } catch (e) { setPwError((e as Error).message); }
    finally { setPwSubmitting(false); }
  };

  const card = 'p-6 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col gap-3 shadow-lg';
  const inp = 'p-3.5 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl text-xs font-mono focus:outline-none text-slate-200 placeholder-slate-600 transition-colors';

  return (
    <div className="flex-1 min-h-full bg-[#020617] text-slate-100 p-4 sm:p-6 lg:p-8 flex flex-col gap-6 overflow-y-auto">
      <Link
        href={settingsPath}
        className="self-start flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 text-sm font-semibold transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Settings
      </Link>

      <header className="pb-3 border-b border-slate-800">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
          <ShieldCheck className="h-7 w-7 text-indigo-400" /> Security
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1 font-mono">
          Two-factor authentication, biometrics, devices, and password.
        </p>
      </header>

      {/* Password / Google */}
      <div className={card}>
        <h3 className="font-sans font-bold text-slate-100 text-[15px] uppercase tracking-wider flex items-center gap-2">
          <Lock className="h-4 w-4 text-indigo-400" /> Password
        </h3>
        {!account ? (
          <p className="text-xs text-slate-500 font-mono">Loading…</p>
        ) : account.authMethod === 'google' ? (
          <p className="text-xs text-slate-400 leading-relaxed">
            This account signs in with Google, so there&apos;s no password to change here. Manage it from your Google account.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5 mt-1">
            <input type="password" autoComplete="current-password" value={curPw} onChange={(e) => setCurPw(e.target.value)} placeholder="Current password" className={inp} />
            <input type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="New password" className={inp} />
            <input type="password" autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="Confirm new password" className={inp} />
            {pwError && <div className="text-xs font-mono text-rose-300">{pwError}</div>}
            {pwSuccess && <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-mono font-bold"><Check className="h-4 w-4 shrink-0" /> Password updated.</div>}
            <button
              onClick={handleChangePassword}
              disabled={pwSubmitting || !curPw || !newPw || !confirmPw}
              className="self-start px-5 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl border border-indigo-500/20 font-bold text-xs transition-all cursor-pointer shadow-md flex items-center gap-2"
            >
              {pwSubmitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              {pwSubmitting ? 'Updating…' : 'Update password'}
            </button>
          </div>
        )}
      </div>

      {/* Email — verify / change the account email */}
      <Link
        href={`${settingsPath}/security/email`}
        className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3 shadow-lg hover:border-indigo-500/40 transition-colors group"
      >
        <div className="flex items-start gap-3 min-w-0">
          <Mail className="h-5 w-5 text-indigo-400 mt-0.5 shrink-0" />
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="font-sans font-bold text-slate-100 text-[15px] uppercase tracking-wider">Email</span>
            <span className="text-xs text-slate-400">Use your email to protect your account and transactions.</span>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {account && <span className="text-xs font-mono text-slate-400 hidden sm:inline">{maskEmail(account.email)}</span>}
          <span className="px-3.5 py-1.5 rounded-lg bg-slate-800 group-hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold">Manage</span>
        </div>
      </Link>

      {/* Two-Factor Authentication (2FA): authenticator app + passkeys */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col gap-4 shadow-lg">
        <h3 className="font-sans font-bold text-slate-100 text-[15px] uppercase tracking-wider flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-indigo-400" /> Two-Factor Authentication (2FA)
        </h3>
        <TwoFactorSection />
        <PasskeysSection />
      </div>

      {/* My Devices — active login sessions (device, location, IP, log out) */}
      <Link
        href={`${settingsPath}/security/devices`}
        className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3 shadow-lg hover:border-indigo-500/40 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <MonitorSmartphone className="h-5 w-5 text-indigo-400 shrink-0" />
          <div className="flex flex-col gap-0.5">
            <span className="font-sans font-bold text-slate-100 text-[15px] uppercase tracking-wider">My Devices</span>
            <span className="text-xs text-slate-400">See where you&apos;re signed in and log out other sessions.</span>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-slate-500 group-hover:text-indigo-400 transition-colors shrink-0" />
      </Link>
    </div>
  );
}
