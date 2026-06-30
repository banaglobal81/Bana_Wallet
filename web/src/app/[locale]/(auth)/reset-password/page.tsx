'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Lock, KeyRound, AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { resetPassword } from '@/utils/accountApi';

function ResetPasswordForm() {
  const t = useTranslations('resetPassword');
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError(t('errorTooShort')); return; }
    if (password !== confirm) { setError(t('errorMismatch')); return; }

    setLoading(true);
    try {
      await resetPassword(token, password);
      // Send them to login with the locale-aware router; password now updated.
      router.push('/login?reset=1');
    } catch (err) {
      setError((err as Error).message || t('errorGeneric'));
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" /> {t('missingToken')}
        </div>
        <Link href="/forgot-password" className="flex items-center justify-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 font-semibold transition-colors">
          <ArrowLeft className="h-4 w-4" /> {t('requestNew')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
          {t('newPasswordLabel')}
        </label>
        <div className="relative">
          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('newPasswordPlaceholder')}
            className="w-full pl-10 pr-4 py-3 bg-slate-950/60 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm" className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
          {t('confirmLabel')}
        </label>
        <div className="relative">
          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={t('confirmPlaceholder')}
            className="w-full pl-10 pr-4 py-3 bg-slate-950/60 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        {loading ? t('submitting') : t('submit')}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  const t = useTranslations('resetPassword');
  return (
    <div className="w-full max-w-md">
      <div className="bana-glass rounded-2xl p-8 shadow-2xl shadow-black/40">
        <h1 className="text-2xl font-extrabold text-white mb-1">{t('title')}</h1>
        <p className="text-sm text-slate-400 mb-7">{t('subtitle')}</p>
        <Suspense fallback={<div className="text-sm text-slate-500">…</div>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
