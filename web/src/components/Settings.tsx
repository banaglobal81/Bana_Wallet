'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Decimal from 'decimal.js';
import { Screen, SystemSettings } from '../types';
import { copyToClipboard } from '../utils/clipboard';
import { getAccount, changePassword, AccountInfo,
  listSavedAddresses, addSavedAddress, deleteSavedAddress, type SavedAddress } from '../utils/accountApi';
import { getNotifPrefs, setNotifPref, onNotifPrefsChange, NOTIF_CATEGORIES, type NotifPrefs } from '../utils/notifPrefs';
import { Link } from '@/i18n/navigation';
import {
  ShieldCheck,
  Copy,
  Check,
  Zap,
  RefreshCw,
  Sparkles,
  Lock,
  KeyRound,
  Link2,
  Link2Off,
  User,
  Mail,
  Bell,
  BookMarked,
  Plus,
  Trash2,
  Activity,
  ChevronRight
} from 'lucide-react';

interface SettingsProps {
  settings: SystemSettings;
  onUpdateSettings: (updater: Partial<SystemSettings>) => void;
  onNavigate: (toScreen: Screen, direction: 'push' | 'push_back' | 'slide_up' | 'none') => void;
}

export default function Settings({ settings, onUpdateSettings, onNavigate }: SettingsProps) {
  const t = useTranslations('settings');
  const [rpcInput, setRpcInput] = useState(settings.rpcUrl);
  const [rpcSaved, setRpcSaved] = useState(false);

  // ---- Account info (email / role / auth method) ----
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);

  // ---- Withdrawal address book ----
  const [savedAddrs, setSavedAddrs] = useState<SavedAddress[]>([]);
  const [abLabel, setAbLabel] = useState('');
  const [abNetwork, setAbNetwork] = useState('');
  const [abAddress, setAbAddress] = useState('');
  const [abError, setAbError] = useState<string | null>(null);
  const [abBusy, setAbBusy] = useState(false);

  const loadAddrs = async () => setSavedAddrs(await listSavedAddresses());
  useEffect(() => { loadAddrs(); }, []);

  const handleAddAddr = async () => {
    setAbError(null);
    setAbBusy(true);
    try {
      await addSavedAddress({ label: abLabel.trim(), network: abNetwork.trim().toUpperCase(), address: abAddress.trim() });
      setAbLabel(''); setAbNetwork(''); setAbAddress('');
      await loadAddrs();
    } catch (e) {
      setAbError((e as Error).message);
    } finally {
      setAbBusy(false);
    }
  };

  const handleDeleteAddr = async (id: string) => {
    setAbError(null);
    try { await deleteSavedAddress(id); await loadAddrs(); }
    catch (e) { setAbError((e as Error).message); }
  };

  // ---- Change password form ----
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSubmitting, setPwSubmitting] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  // ---- Notification display preferences ----
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>(getNotifPrefs());

  const handleChangePassword = async () => {
    setPwError(null);
    setPwSuccess(false);
    if (newPw.length < 8) { setPwError(t('passwordTooShort')); return; }
    if (newPw !== confirmPw) { setPwError(t('passwordMismatch')); return; }
    setPwSubmitting(true);
    try {
      await changePassword(curPw, newPw);
      setPwSuccess(true);
      setCurPw(''); setNewPw(''); setConfirmPw('');
      setTimeout(() => setPwSuccess(false), 4000);
    } catch (e: any) {
      setPwError(e?.message || t('couldNotChangePassword'));
    } finally {
      setPwSubmitting(false);
    }
  };

  const toggleNotifPref = (key: keyof NotifPrefs) => {
    const next = !notifPrefs[key];
    setNotifPref(key, next);
    setNotifPrefs((prev) => ({ ...prev, [key]: next }));
  };

  useEffect(() => {
    // Load account info.
    (async () => {
      try { setAccount(await getAccount()); }
      catch (e: any) { setAccountError(e?.message || t('couldNotLoadAccount')); }
    })();
    // Sync notification prefs (in case another tab changed them).
    setNotifPrefs(getNotifPrefs());
    return onNotifPrefsChange(() => setNotifPrefs(getNotifPrefs()));
  }, []);



  const handleUpdateRpc = () => {
    onUpdateSettings({ rpcUrl: rpcInput });
    setRpcSaved(true);
    setTimeout(() => setRpcSaved(false), 2500);
  };

  const handleNav = (target: Screen, dir: 'push' | 'push_back' | 'none') => {
    onNavigate(target, dir);
  };

  return (
    <div className="flex-1 min-h-full bg-[#020617] text-slate-100 p-4 sm:p-6 lg:p-8 flex flex-col gap-6 overflow-y-auto">


      {/* Primary Page Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center pb-3 border-b border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            {t('pageTitle')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-mono">
            {t('pageSubtitle')}
          </p>
        </div>

        <div className="self-start sm:self-auto flex items-center gap-2">
          {/* Activity moved here from the mobile bottom bar — tap to view history. */}
          <button
            onClick={() => handleNav('ACTIVITY_HISTORY', 'push')}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 hover:bg-indigo-500/20 hover:text-white text-xs font-bold transition-colors cursor-pointer"
          >
            <Activity className="h-4 w-4" /> {t('breadcrumbActivity')}
          </button>
          <div className="flex items-center gap-1 text-[11px] font-mono font-bold bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-xl text-indigo-400 uppercase tracking-widest">
            {t('clientBadge')}
          </div>
        </div>
      </header>

      {/* Main Settings Form Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-2">
        
        {/* Left Column Fields - Width 3/5 */}
        <div className="lg:col-span-3 min-w-0 flex flex-col gap-5">

          {/* Section: Account */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col gap-3 bento-hover shadow-lg">
            <h3 className="font-sans font-bold text-slate-100 text-[15px] uppercase tracking-wider flex items-center gap-2">
              <User className="h-4 w-4 text-indigo-400" />
              {t('accountTitle')}
            </h3>
            {accountError ? (
              <div className="p-3.5 bg-rose-500/5 border border-rose-500/20 rounded-xl text-xs font-mono text-rose-300">
                {accountError}
              </div>
            ) : !account ? (
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-400">
                {t('loadingAccount')}
              </div>
            ) : (
              <div className="flex flex-col gap-3 mt-1">
                <div className="flex items-center justify-between gap-3 p-3.5 bg-slate-950 border border-slate-800 rounded-xl">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Mail className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="font-mono text-xs text-slate-200 truncate">{account.email}</span>
                  </div>
                  <span className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono border ${
                    account.role === 'ADMIN'
                      ? 'bg-purple-500/10 text-purple-300 border-purple-500/25'
                      : 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}>
                    {account.role}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  {t('signedInWith', { method: account.authMethod === 'google' ? t('signedInGoogle') : t('signedInEmail') })}
                </div>
              </div>
            )}
          </div>

          {/* Section: Security — opens the dedicated Security page (2FA,
              biometric, devices, password). */}
          <Link
            href="/settings/security"
            className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3 bento-hover shadow-lg hover:border-indigo-500/40 transition-colors group"
          >
            <div className="flex flex-col gap-1">
              <h3 className="font-sans font-bold text-slate-100 text-[15px] uppercase tracking-wider flex items-center gap-2">
                <Lock className="h-4 w-4 text-indigo-400" />
                {t('securityTitle')}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Two-factor authentication, biometrics, devices, and password.
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-500 group-hover:text-indigo-400 transition-colors shrink-0" />
          </Link>

          {/* Section: Withdrawal Address Book */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col gap-3 bento-hover shadow-lg">
            <h3 className="font-sans font-bold text-slate-100 text-[15px] uppercase tracking-wider flex items-center gap-2">
              <BookMarked className="h-4 w-4 text-indigo-400" />
              {t('addressBookTitle')}
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">{t('addressBookBody')}</p>

            {abError && (
              <div className="px-3.5 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">{abError}</div>
            )}

            {/* Saved list */}
            {savedAddrs.length > 0 && (
              <div className="flex flex-col gap-2 mt-1">
                {savedAddrs.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 p-3 bg-slate-950 border border-slate-800 rounded-xl">
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-slate-200 flex items-center gap-2">
                        {a.label}
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">{a.network}</span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-500 truncate">{a.address}</div>
                    </div>
                    <button
                      onClick={() => handleDeleteAddr(a.id)}
                      aria-label={t('deleteAddress')}
                      className="shrink-0 p-2 rounded-lg border border-slate-700 bg-slate-800/60 text-slate-400 hover:text-rose-400 hover:border-rose-500/30 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add form */}
            <div className="flex flex-col gap-2 mt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  value={abLabel}
                  onChange={(e) => setAbLabel(e.target.value)}
                  placeholder={t('addressLabelPlaceholder')}
                  className="p-3 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl text-xs font-sans focus:outline-none text-slate-200 placeholder-slate-600 transition-colors"
                />
                <input
                  value={abNetwork}
                  onChange={(e) => setAbNetwork(e.target.value)}
                  placeholder={t('addressNetworkPlaceholder')}
                  className="p-3 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl text-xs font-mono uppercase focus:outline-none text-slate-200 placeholder-slate-600 transition-colors"
                />
              </div>
              <div className="flex gap-2">
                <input
                  value={abAddress}
                  onChange={(e) => setAbAddress(e.target.value)}
                  placeholder={t('addressValuePlaceholder')}
                  className="flex-1 min-w-0 p-3 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl text-xs font-mono focus:outline-none text-slate-200 placeholder-slate-600 transition-colors"
                />
                <button
                  onClick={handleAddAddr}
                  disabled={abBusy || !abLabel.trim() || !abNetwork.trim() || abAddress.trim().length < 16}
                  className="shrink-0 inline-flex items-center gap-1.5 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-xs transition-colors cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> {t('addAddress')}
                </button>
              </div>
            </div>
          </div>

          {/* Section B: Custom RPC Connection */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col gap-3 bento-hover shadow-lg" hidden>
            <h3 className="font-sans font-bold text-slate-100 text-[15px] uppercase tracking-wider">
              {t('rpcTitle')}
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              {t('rpcBody')}
            </p>

            <div className="flex flex-col gap-2 mt-1">
              <div className="flex gap-2.5 items-center">
                <input 
                  type="text" 
                  value={rpcInput}
                  onChange={(e) => setRpcInput(e.target.value)}
                  className="flex-1 p-3.5 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl text-xs font-mono focus:outline-none text-slate-200 placeholder-slate-600 transition-colors"
                  placeholder={t('rpcPlaceholder')}
                />
                <button 
                  onClick={handleUpdateRpc}
                  className="px-5 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl border border-indigo-500/20 font-bold text-xs transition-all cursor-pointer shadow-md select-none shrink-0"
                >
                  {t('update')}
                </button>
              </div>

              {rpcSaved && (
                <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-mono font-bold mt-1.5">
                  <Check className="h-4 w-4 shrink-0" />
                  {t('rpcSaved')}
                </div>
              )}
            </div>
          </div>

          {/* Section C: MEV Protection — not applicable to custody (hidden) */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col gap-4 bento-hover shadow-lg" hidden>
            <div className="flex justify-between items-center pb-2 border-b border-slate-800/60">
              <div>
                <h3 className="font-sans font-bold text-slate-100 text-[15px] uppercase tracking-wider">
                  {t('mevTitle')}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  {t('mevBody')}
                </p>
              </div>

              {/* Status Switch Widget */}
              <button
                onClick={() => onUpdateSettings({ mevProtection: !settings.mevProtection })}
                className={`w-14 h-8 rounded-full p-1 transition-colors duration-300 relative cursor-pointer outline-none border ${
                  settings.mevProtection 
                    ? 'bg-emerald-500/10 border-emerald-500/30' 
                    : 'bg-rose-500/10 border-rose-500/30'
                }`}
              >
                <div className={`w-5.5 h-5.5 rounded-full transition-all duration-300 absolute top-1 ${
                  settings.mevProtection 
                    ? 'right-1 bg-emerald-400' 
                    : 'left-1 bg-rose-400'
                }`} />
              </button>
            </div>

            <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl text-xs text-slate-300 leading-relaxed flex items-center gap-3">
              <Sparkles className="h-4 w-4 text-indigo-400 shrink-0" />
              <span>
                {settings.mevProtection
                  ? t('mevOn')
                  : t('mevOff')}
              </span>
            </div>
          </div>

        </div>

        {/* Right Details Info Column - Width 2/5 */}
        <div className="lg:col-span-2 min-w-0 flex flex-col gap-6">
          
          {/* Section D: Gas speed — not applicable to custody (hidden) */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col gap-3 font-mono text-xs bento-hover shadow-lg" hidden>
            <h3 className="font-sans font-bold text-slate-100 text-[14px] uppercase tracking-wider mb-1">
              {t('gasTitle')}
            </h3>
            <p className="text-xs font-sans text-slate-400 leading-relaxed">
              {t('gasBody')}
            </p>

            <div className="flex flex-col gap-2.5 mt-2 font-sans select-none">
              {(['Standard', 'Fast', 'Instant'] as const).map((speed) => (
                <button
                  key={speed}
                  onClick={() => onUpdateSettings({ networkGas: speed })}
                  className={`p-3.5 rounded-xl border text-left font-semibold transition-all flex items-center justify-between cursor-pointer ${
                    settings.networkGas === speed
                      ? 'bg-indigo-505/10 border-indigo-500 text-white shadow-md bg-indigo-500/5'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Zap className={`h-4 w-4 ${settings.networkGas === speed ? 'text-indigo-400' : 'text-slate-400'}`} />
                    <span className="text-[13px]">{t('gasPriority', { speed })}</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-450 font-semibold">
                    {speed === 'Standard' && '30 Gwei (~$4.50)'}
                    {speed === 'Fast' && '45 Gwei (~$12.42)'}
                    {speed === 'Instant' && '80 Gwei (~$25.00)'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Section E: Slippage — only relevant to (simulated) swap (hidden) */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col gap-3 font-mono text-xs bento-hover shadow-lg" hidden>
            <h3 className="font-sans font-bold text-slate-100 text-[14px] uppercase tracking-wider mb-1">
              {t('slippageTitle')}
            </h3>
            <p className="text-xs font-sans text-slate-400 leading-relaxed">
              {t('slippageBody')}
            </p>

            <div className="grid grid-cols-4 gap-2 text-xs font-sans select-none mt-2">
              {(['0.1', '0.5', '1.0'] as const).map((preset) => (
                <button
                  key={preset}
                  onClick={() => onUpdateSettings({ selectedSlippage: preset, customSlippage: preset })}
                  className={`py-2 rounded-lg border text-center font-bold transition-all cursor-pointer ${
                    settings.selectedSlippage === preset
                      ? 'bg-indigo-600 text-white border-transparent'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  {preset}%
                </button>
              ))}
              <button
                onClick={() => onUpdateSettings({ selectedSlippage: 'custom' })}
                className={`py-2 rounded-lg border text-center font-bold transition-all cursor-pointer ${
                  settings.selectedSlippage === 'custom'
                    ? 'bg-indigo-600 text-white border-transparent'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                {t('custom')}
              </button>
            </div>

            {settings.selectedSlippage === 'custom' && (
              <div className="mt-2 flex flex-col gap-1.5 font-sans">
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={settings.customSlippage}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '' || /^\d*\.?\d*$/.test(v)) onUpdateSettings({ customSlippage: v });
                    }}
                    placeholder={t('customPercent')}
                    className="w-full p-2.5 pr-8 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg text-xs font-mono focus:outline-none text-slate-200 placeholder-slate-600 transition-colors"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-mono">%</span>
                </div>
                {(() => {
                  // Validate the custom slippage with decimal.js (rule #2).
                  let warn: string | null = null;
                  try {
                    const d = new Decimal(settings.customSlippage || 0);
                    if (d.lte(0)) warn = t('slippageGreaterThanZero');
                    else if (d.gt(50)) warn = t('slippageVeryHigh');
                  } catch { warn = t('slippageInvalid'); }
                  return warn ? <span className="text-[10px] font-mono text-amber-400">{warn}</span> : null;
                })()}
              </div>
            )}
          </div>

          {/* Section F: Notification preferences */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col gap-3 font-mono text-xs bento-hover shadow-lg">
            <h3 className="font-sans font-bold text-slate-100 text-[14px] uppercase tracking-wider mb-1 flex items-center gap-2">
              <Bell className="h-4 w-4 text-indigo-400" />
              {t('notificationsTitle')}
            </h3>
            <p className="text-xs font-sans text-slate-400 leading-relaxed">
              {t('notificationsBody')}
            </p>

            <div className="flex flex-col gap-2 mt-1 font-sans">
              {NOTIF_CATEGORIES.map((cat) => (
                <div key={cat.key} className="flex items-center justify-between gap-3 p-3 bg-slate-950 border border-slate-800 rounded-xl">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-slate-200">{cat.label}</div>
                    <div className="text-[10px] text-slate-500">{cat.desc}</div>
                  </div>
                  <button
                    onClick={() => toggleNotifPref(cat.key)}
                    aria-label={t('toggleCategory', { label: cat.label })}
                    aria-pressed={notifPrefs[cat.key]}
                    className={`w-12 h-7 rounded-full p-1 transition-colors duration-300 relative cursor-pointer outline-none border shrink-0 ${
                      notifPrefs[cat.key]
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : 'bg-slate-800 border-slate-700'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full transition-all duration-300 absolute top-1 ${
                      notifPrefs[cat.key] ? 'right-1 bg-emerald-400' : 'left-1 bg-slate-500'
                    }`} />
                  </button>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
