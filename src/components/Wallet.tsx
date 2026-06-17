'use client';

import React, { useState, useEffect } from 'react';
import { Screen, SystemSettings } from '../types'; // SystemSettings kept for WalletProps signature
import { getNiaBalance } from '../utils/niaApi';
import {
  Wallet as WalletIcon,
  Download,
  Upload,
  ShieldCheck,
  RefreshCw,
  ChevronRight,
  Activity as ActivityIcon,
} from 'lucide-react';

interface WalletProps {
  settings: SystemSettings;
  onNavigate: (toScreen: Screen, direction: 'push' | 'push_back' | 'slide_up' | 'none') => void;
}

interface BalanceRow { walletType: string; currency: string; balance: string; locked?: string }

export default function Wallet({ onNavigate }: WalletProps) {
  // User-side balances only — broker/settlement panel lives at /admin/settlement
  const [rows, setRows] = useState<BalanceRow[]>([]);
  const [balState, setBalState] = useState<'loading' | 'ok' | 'error'>('loading');

  const loadUser = async () => {
    setBalState('loading');
    try {
      const data = await getNiaBalance();
      const merged: BalanceRow[] = [
        ...(Array.isArray(data?.wallets) ? data.wallets : []),
        ...(Array.isArray(data?.tradingBalances) ? data.tradingBalances : []),
        ...(Array.isArray(data) ? data : []),
      ];
      setRows(merged);
      setBalState('ok');
    } catch { setBalState('error'); }
  };

  useEffect(() => { loadUser(); }, []);

  return (
    <div className="flex-1 min-h-full bg-[#06132a] text-[#d8e2ff] p-4 sm:p-6 lg:p-8 flex flex-col gap-6 overflow-y-auto">

      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center pb-2 border-b border-[#1E3559]/40">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <WalletIcon className="h-7 w-7 text-[#528dff]" />
            Wallet
          </h1>
          <p className="text-xs sm:text-sm text-[#8c90a0] mt-1 font-mono">
            User account — deposit, withdraw, and review balances.
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/25 rounded-lg text-emerald-400 font-semibold text-xs font-mono select-none self-start sm:self-auto">
          <ShieldCheck className="h-4 w-4" /> NIA SECURED
        </div>
      </header>

      {/* Deposit / Withdraw */}
      <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => onNavigate('DEPOSIT_INTERFACE', 'slide_up')}
              className="group p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] hover:border-emerald-400/40 transition-all flex items-center justify-between gap-3 cursor-pointer text-left"
            >
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400"><Download className="h-5 w-5" /></div>
                <div>
                  <div className="text-sm font-bold text-white">Deposit / Receive</div>
                  <div className="text-xs text-[#8c90a0]">Add funds to your wallet</div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-[#8c90a0] group-hover:translate-x-0.5 transition-transform" />
            </button>
            <button
              onClick={() => onNavigate('WITHDRAW_INTERFACE', 'slide_up')}
              className="group p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] hover:border-[#528dff]/40 transition-all flex items-center justify-between gap-3 cursor-pointer text-left"
            >
              <div className="flex items-center gap-3">
                <div className="p-3 bg-[#528dff]/10 rounded-xl text-[#528dff]"><Upload className="h-5 w-5" /></div>
                <div>
                  <div className="text-sm font-bold text-white">Withdraw / Send</div>
                  <div className="text-xs text-[#8c90a0]">Send funds to an address</div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-[#8c90a0] group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          {/* Balances */}
          <div className="p-6 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-sans font-extrabold text-[#d8e2ff] text-sm uppercase tracking-wider">Balances</h3>
              <button onClick={loadUser} aria-label="Refresh balances" className="p-2 bg-[#020d24]/60 hover:bg-[#1e3459] border border-[#1E3559] rounded-lg text-[#8c90a0] hover:text-white transition-colors cursor-pointer">
                <RefreshCw className={`h-4 w-4 ${balState === 'loading' ? 'animate-spin' : ''}`} />
              </button>
            </div>
            {balState === 'loading' ? (
              <p className="text-xs font-mono text-[#8c90a0] py-6 text-center">Loading balances from Nia-Hub…</p>
            ) : balState === 'error' ? (
              <p className="text-xs font-mono text-rose-300 py-6 text-center">Couldn't reach the backend (run npm run server).</p>
            ) : rows.length === 0 ? (
              <div className="py-8 text-center flex flex-col items-center gap-2">
                <div className="p-3 bg-[#020d24]/60 rounded-full border border-[#1E3559]"><WalletIcon className="h-6 w-6 text-[#8c90a0]" /></div>
                <p className="text-sm font-bold text-white">No balances yet</p>
                <p className="text-xs text-[#8c90a0] max-w-xs">This user has no funds. Once a funded user is configured, balances appear here automatically.</p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-2 px-2">
                <table className="w-full min-w-[420px] text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#1E3559]/60 text-[11px] font-mono text-[#8c90a0] uppercase tracking-wider">
                      <th className="pb-3 font-semibold">Wallet</th>
                      <th className="pb-3 font-semibold">Asset</th>
                      <th className="pb-3 text-right font-semibold">Available</th>
                      <th className="pb-3 text-right font-semibold">Locked</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E3559]/40">
                    {rows.map((r, i) => (
                      <tr key={i} className="hover:bg-[#020d24]/40 transition-colors">
                        <td className="py-3.5 font-mono text-xs text-[#afc6ff]">{r.walletType}</td>
                        <td className="py-3.5 font-sans text-sm font-bold text-white">{r.currency}</td>
                        <td className="py-3.5 text-right font-mono text-sm text-white">{r.balance}</td>
                        <td className="py-3.5 text-right font-mono text-xs text-[#8c90a0]">{r.locked ?? '0'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Activity shortcut */}
          <button
            onClick={() => onNavigate('ACTIVITY_HISTORY', 'push')}
            className="p-4 rounded-2xl bg-[#112643]/50 border border-[#1E3559] hover:border-[#528dff]/40 transition-colors flex items-center justify-between gap-3 cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-[#528dff]/10 rounded-xl text-[#528dff]"><ActivityIcon className="h-5 w-5" /></div>
              <div className="text-left">
                <div className="text-sm font-bold text-white">Transaction history</div>
                <div className="text-xs text-[#8c90a0]">Deposits, withdrawals & trades</div>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-[#8c90a0] group-hover:translate-x-0.5 transition-transform" />
          </button>
      </>
    </div>
  );
}
