'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Mail, Send, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { requestPasswordReset } from '@/utils/accountApi';

export default function ForgotPasswordPage() {
  const t = useTranslations('forgotPassword');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Always resolves (no enumeration) — show the same confirmation regardless.
    await requestPasswordReset(email);
    setLoading(false);
    setSent(true);
  };

  return (
    <div className="w-full max-w-md">
      <div className="bana-glass rounded-2xl p-8 shadow-2xl shadow-black/40">
        <h1 className="text-2xl font-extrabold text-white mb-1">{t('title')}</h1>
        <p className="text-sm text-slate-400 mb-7">{t('subtitle')}</p>

        {sent ? (
          <div className="flex flex-col gap-5">
            <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm">
              <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
              <p>{t('sentNotice')}</p>
            </div>
            <Link href="/login" className="flex items-center justify-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 font-semibold transition-colors">
              <ArrowLeft className="h-4 w-4" /> {t('backToLogin')}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
                {t('emailLabel')}
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('emailPlaceholder')}
                  className="w-full pl-10 pr-4 py-3 bg-slate-950/60 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {loading ? t('submitting') : t('submit')}
            </button>

            <Link href="/login" className="flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-slate-300 font-semibold transition-colors">
              <ArrowLeft className="h-4 w-4" /> {t('backToLogin')}
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
