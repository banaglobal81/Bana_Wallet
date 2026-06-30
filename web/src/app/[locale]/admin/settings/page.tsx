'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { SlidersHorizontal, ShieldCheck, Zap, Wrench, Gauge, UserPlus, AtSign, Check, Loader2 } from 'lucide-react';
import { getPlatformPolicy, setPlatformPolicy, type PlatformPolicy } from '@/utils/adminApi';

export default function AdminSettingsPage() {
  const t = useTranslations('adminSettings');
  const [policy, setPolicy] = useState<PlatformPolicy | null>(null);
  const [threshold, setThreshold] = useState('');
  const [dailyLimit, setDailyLimit] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const sync = (p: PlatformPolicy) => {
    setPolicy(p);
    setThreshold(p.autoApproveUnderUsd ?? '');
    setDailyLimit(p.dailyWithdrawalLimitUsd ?? '');
    setSupportEmail(p.supportEmail ?? '');
    setDisplayName(p.displayName ?? '');
  };

  const load = useCallback(async () => {
    setLoading(true);
    try { sync(await getPlatformPolicy()); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (patch: Partial<PlatformPolicy>) => {
    setSaving(true); setError(null); setSaved(false);
    try {
      sync(await setPlatformPolicy(patch));
      setSaved(true); setTimeout(() => setSaved(false), 1500);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const Toggle = ({ on, danger, onClick }: { on: boolean; danger?: boolean; onClick: () => void }) => (
    <button
      disabled={saving}
      onClick={onClick}
      aria-pressed={on}
      className={`shrink-0 w-14 h-8 rounded-full p-1 transition-colors relative cursor-pointer border disabled:opacity-50 ${
        on ? (danger ? 'bg-amber-500/20 border-amber-500/40' : 'bg-emerald-500/20 border-emerald-500/40') : 'bg-slate-700/40 border-slate-600'
      }`}
    >
      <div className={`w-6 h-6 rounded-full transition-all absolute top-1 ${on ? `right-1 ${danger ? 'bg-amber-400' : 'bg-emerald-400'}` : 'left-1 bg-slate-400'}`} />
    </button>
  );

  const card = 'p-6 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-3';

  return (
    <div className="flex-1 min-h-full bg-[#06132a] text-[#d8e2ff] p-4 sm:p-6 lg:p-8 flex flex-col gap-6 overflow-y-auto">
      <header className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center pb-2 border-b border-[#1E3559]/40">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <SlidersHorizontal className="h-7 w-7 text-[#528dff]" /> {t('pageTitle')}
          </h1>
          <p className="text-xs sm:text-sm text-[#8c90a0] mt-1 font-mono">{t('pageSubtitle')}</p>
        </div>
        {saved && (
          <span className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-bold">
            <Check className="h-4 w-4" /> {t('saved')}
          </span>
        )}
      </header>

      {error && <div className="px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm">{error}</div>}

      {loading || !policy ? (
        <p className="text-xs font-mono text-[#8c90a0] py-6">{t('loading')}</p>
      ) : (
        <div className="max-w-2xl flex flex-col gap-5">
          {/* Maintenance mode */}
          <div className={card}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h3 className="font-sans font-bold text-white text-sm flex items-center gap-2"><Wrench className="h-4 w-4 text-amber-400" /> {t('maintenanceTitle')}</h3>
                <p className="text-xs text-[#8c90a0] leading-relaxed">{t('maintenanceBody')}</p>
              </div>
              <Toggle on={policy.maintenanceMode} danger onClick={() => save({ maintenanceMode: !policy.maintenanceMode })} />
            </div>
          </div>

          {/* Whitelist-only */}
          <div className={card}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h3 className="font-sans font-bold text-white text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" /> {t('whitelistTitle')}</h3>
                <p className="text-xs text-[#8c90a0] leading-relaxed">{t('whitelistBody')}</p>
              </div>
              <Toggle on={policy.whitelistOnly} onClick={() => save({ whitelistOnly: !policy.whitelistOnly })} />
            </div>
          </div>

          {/* New signups */}
          <div className={card}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h3 className="font-sans font-bold text-white text-sm flex items-center gap-2"><UserPlus className="h-4 w-4 text-[#528dff]" /> {t('signupsTitle')}</h3>
                <p className="text-xs text-[#8c90a0] leading-relaxed">{t('signupsBody')}</p>
              </div>
              <Toggle on={policy.signupsEnabled} onClick={() => save({ signupsEnabled: !policy.signupsEnabled })} />
            </div>
          </div>

          {/* Auto-approve threshold */}
          <div className={card}>
            <h3 className="font-sans font-bold text-white text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-amber-400" /> {t('autoApproveTitle')}</h3>
            <p className="text-xs text-[#8c90a0] leading-relaxed">{t('autoApproveBody')}</p>
            <div className="flex items-center gap-2 mt-1">
              <div className="relative flex-1 max-w-[220px]">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8c90a0] text-sm font-mono">$</span>
                <input value={threshold} onChange={(e) => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) setThreshold(v); }} placeholder={t('amountPlaceholder')} inputMode="decimal"
                  className="w-full pl-7 pr-3 py-2.5 rounded-xl bg-[#020d24]/60 border border-[#1E3559] text-sm font-mono text-[#d8e2ff] placeholder-[#8c90a0] focus:outline-none focus:border-[#528dff]/60 transition-colors" />
              </div>
              <button disabled={saving} onClick={() => save({ autoApproveUnderUsd: threshold.trim() || null })} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold cursor-pointer">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} {t('save')}</button>
            </div>
            <p className="text-[11px] font-mono text-[#8c90a0]">{policy.autoApproveUnderUsd ? t('autoApproveOn', { amount: policy.autoApproveUnderUsd }) : t('autoApproveOff')}</p>
          </div>

          {/* Daily withdrawal limit */}
          <div className={card}>
            <h3 className="font-sans font-bold text-white text-sm flex items-center gap-2"><Gauge className="h-4 w-4 text-rose-400" /> {t('dailyLimitTitle')}</h3>
            <p className="text-xs text-[#8c90a0] leading-relaxed">{t('dailyLimitBody')}</p>
            <div className="flex items-center gap-2 mt-1">
              <div className="relative flex-1 max-w-[220px]">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8c90a0] text-sm font-mono">$</span>
                <input value={dailyLimit} onChange={(e) => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) setDailyLimit(v); }} placeholder={t('amountPlaceholder')} inputMode="decimal"
                  className="w-full pl-7 pr-3 py-2.5 rounded-xl bg-[#020d24]/60 border border-[#1E3559] text-sm font-mono text-[#d8e2ff] placeholder-[#8c90a0] focus:outline-none focus:border-[#528dff]/60 transition-colors" />
              </div>
              <button disabled={saving} onClick={() => save({ dailyWithdrawalLimitUsd: dailyLimit.trim() || null })} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold cursor-pointer">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} {t('save')}</button>
            </div>
            <p className="text-[11px] font-mono text-[#8c90a0]">{policy.dailyWithdrawalLimitUsd ? t('dailyLimitOn', { amount: policy.dailyWithdrawalLimitUsd }) : t('dailyLimitOff')}</p>
          </div>

          {/* Platform identity */}
          <div className={card}>
            <h3 className="font-sans font-bold text-white text-sm flex items-center gap-2"><AtSign className="h-4 w-4 text-[#528dff]" /> {t('identityTitle')}</h3>
            <p className="text-xs text-[#8c90a0] leading-relaxed">{t('identityBody')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t('displayNamePlaceholder')}
                className="p-2.5 rounded-xl bg-[#020d24]/60 border border-[#1E3559] text-sm text-[#d8e2ff] placeholder-[#8c90a0] focus:outline-none focus:border-[#528dff]/60 transition-colors" />
              <input value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} placeholder={t('supportEmailPlaceholder')} type="email"
                className="p-2.5 rounded-xl bg-[#020d24]/60 border border-[#1E3559] text-sm font-mono text-[#d8e2ff] placeholder-[#8c90a0] focus:outline-none focus:border-[#528dff]/60 transition-colors" />
            </div>
            <button disabled={saving} onClick={() => save({ displayName: displayName.trim() || null, supportEmail: supportEmail.trim() || null })} className="self-start inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold cursor-pointer">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} {t('save')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
