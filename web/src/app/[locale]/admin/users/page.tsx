'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Users, Search, ShieldCheck, KeyRound, Copy, Check, Loader2, RefreshCw, Wallet as WalletIcon, Ban, Unlock, X, ArrowLeft } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import {
  listUsers, setUserRole, createUserResetLink, setUserDisabled, getUserWallet,
  type AdminUser, type AdminUserWallet,
} from '@/utils/adminApi';
import { copyToClipboard } from '@/utils/clipboard';

export default function AdminUsersPage() {
  const t = useTranslations('adminUsers');
  const nav = useTranslations('nav');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<{ id: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [wallet, setWallet] = useState<AdminUserWallet | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);

  const load = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await listUsers(query));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search.
  useEffect(() => {
    const h = setTimeout(() => load(q), 250);
    return () => clearTimeout(h);
  }, [q, load]);

  const toggleRole = async (u: AdminUser) => {
    setBusyId(u.id);
    setError(null);
    try {
      await setUserRole(u.id, u.role === 'ADMIN' ? 'USER' : 'ADMIN');
      await load(q);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const genLink = async (u: AdminUser) => {
    setBusyId(u.id);
    setError(null);
    setResetLink(null);
    try {
      const { link } = await createUserResetLink(u.id);
      setResetLink({ id: u.id, link });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const copyLink = async () => {
    if (!resetLink) return;
    if (await copyToClipboard(resetLink.link)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const toggleDisabled = async (u: AdminUser) => {
    setBusyId(u.id);
    setError(null);
    try {
      await setUserDisabled(u.id, !u.disabled);
      await load(q);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const openWallet = async (u: AdminUser) => {
    setWallet(null);
    setWalletLoading(true);
    setError(null);
    try {
      setWallet(await getUserWallet(u.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWalletLoading(false);
    }
  };

  return (
    <div className="flex-1 min-h-full bg-[#06132a] text-[#d8e2ff] p-4 sm:p-6 lg:p-8 flex flex-col gap-6 overflow-y-auto">
      {/* Back to Settings — this page is opened from the Settings page. */}
      <Link
        href="/admin/settings"
        className="self-start flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#112643]/70 border border-[#1E3559] text-[#afc6ff] hover:text-white hover:bg-[#1e3459] text-sm font-bold transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> {nav('settings')}
      </Link>
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center pb-2 border-b border-[#1E3559]/40">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <Users className="h-7 w-7 text-[#528dff]" />
            {t('pageTitle')}
          </h1>
          <p className="text-xs sm:text-sm text-[#8c90a0] mt-1 font-mono">{t('pageSubtitle')}</p>
        </div>
        <button
          onClick={() => load(q)}
          aria-label={t('refresh')}
          className="self-start p-2 rounded-lg border border-[#1E3559] bg-[#020d24]/60 hover:bg-[#1e3459] text-[#8c90a0] hover:text-white transition-colors cursor-pointer"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8c90a0] pointer-events-none" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#020d24]/60 border border-[#1E3559] text-sm text-[#d8e2ff] placeholder-[#8c90a0] focus:outline-none focus:border-[#528dff]/60 transition-colors"
        />
      </div>

      {error && (
        <div className="px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm">{error}</div>
      )}

      {/* Reset link banner */}
      {resetLink && (
        <div className="p-4 rounded-xl bg-[#112643]/70 border border-[#528dff]/40 flex flex-col gap-2">
          <span className="text-xs font-mono text-[#8c90a0] uppercase tracking-wider">{t('resetLinkNote')}</span>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-[#020d24]/60 border border-[#1E3559]">
            <code className="text-xs font-mono text-[#afc6ff] break-all flex-1 min-w-0">{resetLink.link}</code>
            <button
              onClick={copyLink}
              className="p-2 rounded-lg border border-[#1E3559] bg-[#112643]/50 hover:bg-[#1e3459] text-[#8c90a0] hover:text-white transition-colors cursor-pointer shrink-0"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl bg-[#112643]/70 border border-[#1E3559] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1E3559] text-left text-[11px] font-mono uppercase tracking-wider text-[#8c90a0]">
                <th className="px-4 py-3 font-semibold">{t('colEmail')}</th>
                <th className="px-4 py-3 font-semibold">{t('colRole')}</th>
                <th className="px-4 py-3 font-semibold">{t('colAuth')}</th>
                <th className="px-4 py-3 font-semibold text-right">{t('colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-[#8c90a0] font-mono text-xs">{t('loading')}</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-[#8c90a0] font-mono text-xs">{t('noUsers')}</td></tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="border-b border-[#1E3559]/40 last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[#d8e2ff]">{u.email}</span>
                        {u.disabled && (
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/25">
                            {t('disabledBadge')}
                          </span>
                        )}
                      </div>
                      {u.niaUserId && <div className="text-[10px] font-mono text-[#8c90a0] truncate max-w-[220px]">{u.niaUserId}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                        u.role === 'ADMIN'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                          : 'bg-[#528dff]/10 text-[#528dff] border-[#528dff]/25'
                      }`}>
                        {u.role === 'ADMIN' && <ShieldCheck className="h-3 w-3" />}
                        {u.role === 'ADMIN' ? t('roleAdmin') : t('roleUser')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#8c90a0] font-mono text-xs">
                      {u.authMethod === 'google' ? t('authGoogle') : t('authPassword')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openWallet(u)}
                          title={t('viewWallet')}
                          className="inline-flex items-center justify-center p-1.5 rounded-lg border border-[#1E3559] bg-[#020d24]/60 text-[#8c90a0] hover:bg-[#1e3459] hover:text-white transition-colors cursor-pointer"
                        >
                          <WalletIcon className="h-3.5 w-3.5" />
                        </button>
                        <button
                          disabled={busyId === u.id}
                          onClick={() => toggleRole(u)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold border border-[#1E3559] bg-[#020d24]/60 text-[#d8e2ff] hover:bg-[#1e3459] disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          {u.role === 'ADMIN' ? t('makeUser') : t('makeAdmin')}
                        </button>
                        <button
                          disabled={busyId === u.id || u.authMethod === 'google'}
                          onClick={() => genLink(u)}
                          title={u.authMethod === 'google' ? t('googleNoReset') : t('resetLink')}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-[#1E3559] bg-[#020d24]/60 text-[#d8e2ff] hover:bg-[#1e3459] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        >
                          {busyId === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                          {t('resetLink')}
                        </button>
                        <button
                          disabled={busyId === u.id}
                          onClick={() => toggleDisabled(u)}
                          title={u.disabled ? t('enable') : t('disable')}
                          className={`inline-flex items-center justify-center p-1.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-50 ${
                            u.disabled
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                              : 'border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20'
                          }`}
                        >
                          {u.disabled ? <Unlock className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!loading && users.length > 0 && (
        <p className="text-[11px] font-mono text-[#8c90a0]">{t('total', { count: users.length })}</p>
      )}

      {/* Per-user wallet oversight modal */}
      {(walletLoading || wallet) && (
        <div
          className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
          onClick={() => { setWallet(null); setWalletLoading(false); }}
        >
          <div
            className="w-full max-w-2xl my-8 rounded-2xl bg-[#112643] border border-[#1E3559] shadow-2xl shadow-black/50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 p-4 border-b border-[#1E3559]">
              <h3 className="font-sans font-extrabold text-white text-sm uppercase tracking-wider flex items-center gap-2">
                <WalletIcon className="h-4 w-4 text-[#528dff]" /> {t('walletTitle')}
              </h3>
              <button onClick={() => setWallet(null)} className="p-1.5 rounded-lg text-[#8c90a0] hover:text-white hover:bg-[#1e3459] transition-colors cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            {walletLoading ? (
              <div className="p-8 flex items-center justify-center gap-2.5 text-[#8c90a0]">
                <Loader2 className="h-4 w-4 animate-spin" /> {t('loading')}
              </div>
            ) : wallet ? (
              <div className="p-4 flex flex-col gap-5 max-h-[70vh] overflow-y-auto">
                <div className="font-mono text-xs text-[#8c90a0]">
                  <div className="text-[#d8e2ff] text-sm">{wallet.email}</div>
                  {wallet.niaUserId && <div className="truncate">{wallet.niaUserId}</div>}
                </div>

                {/* Balances */}
                <section className="flex flex-col gap-2">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-[#8c90a0]">{t('balances')}</span>
                  {(() => {
                    const wallets = (wallet.balance as { wallets?: any[] } | null)?.wallets ?? [];
                    return wallets.length === 0 ? (
                      <p className="text-xs font-mono text-[#8c90a0]">{t('noBalances')}</p>
                    ) : (
                      <div className="flex flex-col divide-y divide-[#1E3559]/40">
                        {wallets.map((w: any, i: number) => (
                          <div key={w.currency || i} className="flex items-center justify-between py-2 gap-3">
                            <span className="font-mono text-sm text-[#d8e2ff]">{w.currency}</span>
                            <span className="font-mono text-sm text-white">{w.balance}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </section>

                {/* Deposits + Withdrawals */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {([['deposits', wallet.deposits], ['withdrawals', wallet.withdrawals]] as const).map(([label, list]) => (
                    <section key={label} className="flex flex-col gap-2">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-[#8c90a0]">{t(label)}</span>
                      {!list || list.length === 0 ? (
                        <p className="text-xs font-mono text-[#8c90a0]">{t('none')}</p>
                      ) : (
                        <div className="flex flex-col divide-y divide-[#1E3559]/40">
                          {list.slice(0, 6).map((x: any, i: number) => (
                            <div key={x.id || i} className="flex items-center justify-between py-1.5 gap-2">
                              <span className="font-mono text-xs text-[#d8e2ff] truncate">{x.amount} {x.currency}</span>
                              <span className="font-mono text-[10px] text-[#8c90a0] shrink-0">{x.status}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
