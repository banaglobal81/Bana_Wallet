import React, { useState, useEffect } from 'react';
import { Screen, SystemSettings } from '../types';
import { copyToClipboard } from '../utils/clipboard';
import { getNiaStatus, getNiaBalance, NiaStatus } from '../utils/niaApi';
import { 
  ShieldCheck, 
  Copy, 
  Check, 
  Globe, 
  Cpu, 
  Zap, 
  RefreshCw,
  Wallet,
  Sparkles,
  Lock,
  ArrowRight,
  KeyRound,
  Link2,
  Link2Off
} from 'lucide-react';

interface SettingsProps {
  settings: SystemSettings;
  onUpdateSettings: (updater: Partial<SystemSettings>) => void;
  onNavigate: (toScreen: Screen, direction: 'push' | 'push_back' | 'slide_up' | 'none') => void;
}

export default function Settings({ settings, onUpdateSettings, onNavigate }: SettingsProps) {
  const [copied, setCopied] = useState(false);
  const [rpcInput, setRpcInput] = useState(settings.rpcUrl);
  const [rpcSaved, setRpcSaved] = useState(false);

  // Nia connection status comes from the backend (keys live in .env server-side,
  // never in the browser). We just read /api/nia/status.
  const [niaStatus, setNiaStatus] = useState<NiaStatus | null>(null);
  const [niaLoading, setNiaLoading] = useState(true);
  const [niaError, setNiaError] = useState<string | null>(null);

  const checkNiaStatus = async () => {
    setNiaLoading(true);
    setNiaError(null);
    try {
      setNiaStatus(await getNiaStatus());
    } catch (e: any) {
      setNiaError(e?.message || 'Backend not reachable');
      setNiaStatus(null);
    } finally {
      setNiaLoading(false);
    }
  };

  // Test-user funded check (reads /api/nia/balance for the configured user).
  const [funded, setFunded] = useState<'checking' | 'funded' | 'empty' | 'error'>('checking');

  const checkFunded = async () => {
    setFunded('checking');
    try {
      const data = await getNiaBalance();
      const rows = [
        ...(Array.isArray(data?.wallets) ? data.wallets : []),
        ...(Array.isArray(data?.tradingBalances) ? data.tradingBalances : []),
        ...(Array.isArray(data) ? data : []),
      ];
      const hasFunds = rows.some((r: any) => parseFloat(r?.balance ?? '0') > 0);
      setFunded(hasFunds ? 'funded' : 'empty');
    } catch {
      setFunded('error');
    }
  };

  useEffect(() => {
    (async () => {
      await checkNiaStatus();
    })();
  }, []);

  const niaConnected = Boolean(niaStatus?.configured);

  // Once we know the backend is connected, check whether the user has a balance.
  useEffect(() => {
    if (niaConnected) checkFunded();
  }, [niaConnected]);

  const handleCopyAddress = async () => {
    await copyToClipboard(settings.connectedWallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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

      {/* Breadcrumbs Navigation List */}
      <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-mono text-slate-400 bg-slate-900 p-3 rounded-2xl border border-slate-800 select-none">
        <span className="text-indigo-400 font-bold">NODE MANIFEST REGISTRY:</span>
        <a 
          href="#portfolio" 
          onClick={(e) => { e.preventDefault(); handleNav('PORTFOLIO_DASHBOARD', 'push_back'); }}
          className="hover:text-slate-200 hover:underline transition-all cursor-pointer font-semibold"
        >
          Portfolio
        </a>
        <span>/</span>
        <a 
          href="#swap" 
          onClick={(e) => { e.preventDefault(); handleNav('SWAP_INTERFACE', 'push'); }}
          className="hover:text-slate-200 hover:underline transition-all cursor-pointer font-semibold"
        >
          Swap
        </a>
        <span>/</span>
        <a 
          href="#activity" 
          onClick={(e) => { e.preventDefault(); handleNav('ACTIVITY_HISTORY', 'push'); }}
          className="hover:text-slate-200 hover:underline transition-all cursor-pointer font-semibold"
        >
          Activity
        </a>
      </nav>

      {/* Primary Page Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center pb-3 border-b border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Security & Node Settings
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-mono">
            Adjust private routing nodes, consensus gas speed thresholds, and MEV front-run firewalls.
          </p>
        </div>

        <div className="self-start sm:self-auto flex items-center gap-1 text-[11px] font-mono font-bold bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-xl text-indigo-400 uppercase tracking-widest">
          Client v1.9 • SECURE
        </div>
      </header>

      {/* Main Settings Form Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-2">
        
        {/* Left Column Fields - Width 3/5 */}
        <div className="lg:col-span-3 min-w-0 flex flex-col gap-5">

          {/* Section: Connect Nia Asset API */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col gap-3 bento-hover shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-sans font-bold text-slate-100 text-[15px] uppercase tracking-wider flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-indigo-400" />
                Connect Nia Asset
              </h3>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono border ${
                niaConnected
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}>
                {niaConnected ? <Link2 className="h-3 w-3" /> : <Link2Off className="h-3 w-3" />}
                {niaConnected ? 'CONNECTED' : 'NOT CONNECTED'}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Your Nia-Hub keys live securely on the BANA backend ({'.'}env) and are never exposed to the browser.
              This shows the live connection status.
            </p>

            {niaLoading ? (
              <div className="mt-1 p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-400">
                Checking backend connection…
              </div>
            ) : niaError ? (
              <div className="mt-1 flex flex-col gap-2.5">
                <div className="p-3.5 bg-rose-500/5 border border-rose-500/20 rounded-xl text-xs font-mono text-rose-300 leading-relaxed">
                  Backend not reachable: {niaError}.<br />
                  Start it with <span className="text-white">npm run server</span> (it proxies /api to :8787).
                </div>
                <button
                  onClick={checkNiaStatus}
                  className="self-start px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-lg text-xs font-bold cursor-pointer flex items-center gap-2"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Recheck
                </button>
              </div>
            ) : (
              <div className="mt-1 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3 p-3.5 bg-slate-950 border border-slate-800 rounded-xl">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {niaConnected
                      ? <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
                      : <Link2Off className="h-5 w-5 text-slate-500 shrink-0" />}
                    <div className="min-w-0">
                      <div className="text-xs font-mono text-slate-300 font-semibold">
                        {niaConnected ? `API Key ${niaStatus?.keyPreview ?? ''}` : 'No API key configured'}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500 truncate">
                        {niaConnected
                          ? `Broker ${niaStatus?.brokerId ?? '—'}`
                          : 'Add NIA_API_KEY / NIA_API_SECRET to .env, then restart the server'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={checkNiaStatus}
                    aria-label="Recheck connection"
                    className="shrink-0 p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg cursor-pointer"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </div>

                {/* Test-user funded indicator */}
                {niaConnected && (
                  <div className="flex items-center justify-between gap-3 p-3 bg-slate-950 border border-slate-800 rounded-xl">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[11px] font-mono text-slate-400">
                        Test user <span className="text-slate-300">{niaStatus?.hasDefaultUser ? '(set)' : '(none)'}</span>
                      </span>
                    </div>
                    <span className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono border ${
                      funded === 'funded'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                        : funded === 'empty'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                        : funded === 'error'
                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/25'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}>
                      {funded === 'checking' && <RefreshCw className="h-3 w-3 animate-spin" />}
                      {funded === 'funded' && <Check className="h-3 w-3" />}
                      {funded === 'checking' ? 'CHECKING…'
                        : funded === 'funded' ? 'FUNDED'
                        : funded === 'empty' ? 'EMPTY'
                        : 'CHECK FAILED'}
                    </span>
                  </div>
                )}

                {/* Security note */}
                <div className="flex items-start gap-2 text-[11px] text-slate-500 leading-relaxed font-mono">
                  <Lock className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    The API secret stays in the server{"'"}s {'.'}env file and is <span className="text-slate-300">never sent to the browser</span>.
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Section A: Vault Address Copy Box */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col gap-3 bento-hover shadow-lg">
            <h3 className="font-sans font-bold text-slate-100 text-[15px] uppercase tracking-wider">
              Consensus Cryptographic Wallet
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              This is your verified self-custody wallet address hosting your Institutional Vault funds. Keep private keys offline.
            </p>

            <div className="flex items-center justify-between gap-3 p-3.5 bg-slate-950 border border-slate-800 rounded-xl mt-1">
              <span className="font-mono text-xs tracking-wide text-indigo-300 truncate font-semibold">
                {settings.connectedWallet}
              </span>
              
              <button 
                onClick={handleCopyAddress}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs font-sans font-bold shadow-md shrink-0"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Section B: Custom RPC Connection */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col gap-3 bento-hover shadow-lg">
            <h3 className="font-sans font-bold text-slate-100 text-[15px] uppercase tracking-wider">
              Private Relayer RPC Node URI
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Configure your network relay client connection endpoint. Custom endpoints may alter latency.
            </p>

            <div className="flex flex-col gap-2 mt-1">
              <div className="flex gap-2.5 items-center">
                <input 
                  type="text" 
                  value={rpcInput}
                  onChange={(e) => setRpcInput(e.target.value)}
                  className="flex-1 p-3.5 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl text-xs font-mono focus:outline-none text-slate-200 placeholder-slate-600 transition-colors"
                  placeholder="https://your-node-address..."
                />
                <button 
                  onClick={handleUpdateRpc}
                  className="px-5 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl border border-indigo-500/20 font-bold text-xs transition-all cursor-pointer shadow-md select-none shrink-0"
                >
                  Update
                </button>
              </div>

              {rpcSaved && (
                <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-mono font-bold mt-1.5">
                  <Check className="h-4 w-4 shrink-0" />
                  Connection endpoint configuration synchronized successfully.
                </div>
              )}
            </div>
          </div>

          {/* Section C: MEV Protection & Front-Run Isolation */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col gap-4 bento-hover shadow-lg">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800/60">
              <div>
                <h3 className="font-sans font-bold text-slate-100 text-[15px] uppercase tracking-wider">
                  Mempool MEV protection
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  Toggle secure BANA Private Router tunnel proxying.
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
                  ? 'BANA Private Shield prevents mempool crawlers from sandboxing or copy-trading your swaps.' 
                  : 'Security Alert: Disabling protection leaves swaps vulnerable to sandwich slippage bots.'}
              </span>
            </div>
          </div>

        </div>

        {/* Right Details Info Column - Width 2/5 */}
        <div className="lg:col-span-2 min-w-0 flex flex-col gap-6">
          
          {/* Section D: Consensus Gas Threshold Speed */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col gap-3 font-mono text-xs bento-hover shadow-lg">
            <h3 className="font-sans font-bold text-slate-100 text-[14px] uppercase tracking-wider mb-1">
              Consensus Speed (Gas Limit)
            </h3>
            <p className="text-xs font-sans text-slate-400 leading-relaxed">
              Select default priority block coverage speeds. Fast and Instant bypass network traffic queues.
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
                    <span className="text-[13px]">{speed} Priority</span>
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

          {/* Section E: Default Slippage Settings */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col gap-3 font-mono text-xs bento-hover shadow-lg">
            <h3 className="font-sans font-bold text-slate-100 text-[14px] uppercase tracking-wider mb-1">
              Default Slippage Settings
            </h3>
            <p className="text-xs font-sans text-slate-400 leading-relaxed">
              Protect trade output amounts by reverting swaps that leak capital past predefined parameters.
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
                Custom
              </button>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
