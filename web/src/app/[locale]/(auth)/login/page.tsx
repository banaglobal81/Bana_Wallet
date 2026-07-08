'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { signIn } from 'next-auth/react';
import { Mail, Lock, LogIn, AlertCircle, Loader2, CheckCircle2, Fingerprint, ShieldCheck } from 'lucide-react';
import { getPasskeyAssertion, passkeysSupported } from '@/utils/passkeysApi';

export default function LoginPage() {
  const t = useTranslations('login');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [resetDone, setResetDone] = useState(false);
  const [passkeyReady, setPasskeyReady] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  // Two-factor step: after a correct password, 2FA-enabled accounts must enter a code.
  const [totp, setTotp] = useState('');
  const [twoFAStep, setTwoFAStep] = useState(false);

  useEffect(() => setPasskeyReady(passkeysSupported()), []);

  // Show a success banner when arriving from a completed password reset (?reset=1).
  // Read from window to avoid wrapping the page in a useSearchParams Suspense boundary.
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('reset') === '1') {
      setResetDone(true);
    }
  }, []);

  // Redirects to Google, then back to "/" which routes by role.
  const handleGoogle = async () => {
    setNotice('');
    try {
      await signIn('google', { callbackUrl: '/' });
    } catch {
      setNotice(t('googleError'));
    }
  };

  // Passwordless biometric login (Face ID / fingerprint).
  const handlePasskey = async () => {
    setError(''); setNotice(''); setPasskeyBusy(true);
    try {
      const response = await getPasskeyAssertion();
      const res = await signIn('passkey', { response, redirect: false });
      if (res?.error) {
        setError('Passkey sign-in failed — register a passkey first, or use your password.');
      } else {
        router.push('/');
        router.refresh();
      }
    } catch (e) {
      const msg = (e as Error).message || '';
      if (!/NotAllowed|abort|timed out/i.test(msg)) setError('Passkey sign-in was cancelled or unavailable.');
    } finally {
      setPasskeyBusy(false);
    }
  };

  const finishLogin = async (extra: Record<string, string> = {}) => {
    const res = await signIn('credentials', { email, password, redirect: false, ...extra });
    if (res?.error) return false;
    router.push('/');
    router.refresh();
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (twoFAStep) {
        // Step 2 — submit the second factor.
        if (!(await finishLogin({ totp: totp.trim() }))) setError(t('errorInvalidCode'));
        return;
      }
      // Step 1 — verify the password and find out whether 2FA is required.
      const pre = await fetch('/api/auth/login-precheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await pre.json().catch(() => ({ ok: false }));
      if (!data.ok) { setError(t('errorInvalidCredentials')); return; }
      if (data.twoFactor) { setTwoFAStep(true); return; } // ask for the code next
      if (!(await finishLogin())) setError(t('errorInvalidCredentials'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="bana-glass rounded-2xl p-8 shadow-2xl shadow-black/40">
        <h1 className="text-2xl font-extrabold text-white mb-1">{t('title')}</h1>
        <p className="text-sm text-slate-400 mb-7">{t('subtitle')}</p>

        {resetDone && (
          <div className="flex items-start gap-3 px-4 py-3 mb-5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm">
            <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
            <p>{t('resetSuccess')}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
              {t('emailLabel')}
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
              <input
                id="email"
                type="email"
                autoComplete="off"
                required
                disabled={twoFAStep}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('emailPlaceholder')}
                className="w-full pl-10 pr-4 py-3 bg-slate-950/60 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
              />
            </div>
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
              {t('passwordLabel')}
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
              <input
                id="password"
                type="password"
                autoComplete="off"
                required
                disabled={twoFAStep}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('passwordPlaceholder')}
                className="w-full pl-10 pr-4 py-3 bg-slate-950/60 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
              />
            </div>
            <div className="flex justify-end">
              <Link href="/forgot-password" className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold transition-colors">
                {t('forgotPassword')}
              </Link>
            </div>
          </div>

          {/* 2FA code — shown only after a correct password on a 2FA-enabled account */}
          {twoFAStep && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="totp" className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{t('twoFactorLabel')}</label>
              <div className="relative">
                <ShieldCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                <input
                  id="totp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  required
                  value={totp}
                  onChange={(e) => setTotp(e.target.value)}
                  placeholder={t('twoFactorPlaceholder')}
                  className="w-full pl-10 pr-4 py-3 bg-slate-950/60 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
                />
              </div>
              <div className="flex justify-between">
                <p className="text-xs text-slate-500">{t('twoFactorHint')}</p>
                <button type="button" onClick={() => { setTwoFAStep(false); setTotp(''); setError(''); }} className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold">
                  {t('twoFactorBack')}
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            {loading ? t('submitting') : twoFAStep ? t('verify') : t('submit')}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <span className="h-px flex-1 bg-slate-700/60" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">{t('divider')}</span>
          <span className="h-px flex-1 bg-slate-700/60" />
        </div>

        {/* Continue with Google — UI only (OAuth wired later) */}
        <button
          type="button"
          onClick={handleGoogle}
          className="flex items-center justify-center gap-3 w-full py-3 rounded-xl bg-white hover:bg-slate-100 text-slate-800 text-sm font-bold transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
            <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
            <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
            <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001 6.19 5.238 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
          </svg>
          {t('continueWithGoogle')}
        </button>

        {/* Passwordless biometric login */}
        {passkeyReady && (
          <button
            type="button"
            onClick={handlePasskey}
            disabled={passkeyBusy}
            className="mt-3 flex items-center justify-center gap-3 w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-sm font-bold transition-colors disabled:opacity-50"
          >
            {passkeyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
            Sign in with passkey
          </button>
        )}

        {/* Coming-soon notice */}
        {notice && (
          <p className="mt-3 text-center text-xs text-slate-400">{notice}</p>
        )}

        <p className="mt-6 text-center text-sm text-slate-500">
          {t('noAccount')}{' '}
          <Link href="/signup" className="text-indigo-400 hover:text-indigo-300 font-semibold transition-colors">
            {t('createOne')}
          </Link>
        </p>
      </div>
    </div>
  );
}
