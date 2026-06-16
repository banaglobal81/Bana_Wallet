import React, { useState } from 'react';
import { Screen } from '../types';
import {
  ShieldAlert,
  AlertOctagon,
  AlertTriangle,
  ChevronRight,
  Info,
  CheckCircle,
  TrendingDown
} from 'lucide-react';

interface ScamWarningProps {
  onNavigate: (toScreen: Screen, direction: 'push' | 'push_back' | 'slide_up' | 'none') => void;
  onConfirmSwap: () => void; // Call this if they complete anyway to make sure balances simulate!
  preparedSwap: {
    fromSymbol: string;
    toSymbol: string;
    fromAmount: string;
    toAmount: string;
    isHighRisk: boolean;
    rate: number;
    gasFee: string;
  } | null;
}

export default function ScamWarning({ onNavigate, onConfirmSwap, preparedSwap }: ScamWarningProps) {
  const [agreed, setAgreed] = useState(false);

  const details = preparedSwap || {
    fromSymbol: 'ETH',
    toSymbol: 'USDC',
    fromAmount: '1.00',
    toAmount: '2,415.82',
    isHighRisk: true,
    rate: 2415.82,
    gasFee: '$12.42'
  };

  const handleReject = () => {
    // Navigates to Swap interface with push_back direction
    onNavigate('SWAP_INTERFACE', 'push_back');
  };

  const handleConfirmAnyway = () => {
    // Execute swap simulation even with bypass!
    onConfirmSwap();
    // Navigates to Portfolio dashboard with push direction
    onNavigate('PORTFOLIO_DASHBOARD', 'push');
  };

  return (
    <div className="flex-1 min-h-full bg-[#020617] text-slate-100 p-4 sm:p-8 flex flex-col justify-center items-center relative overflow-y-auto">

      {/* Background neon hazard grid overlay */}
      <div className="absolute inset-0 bg-gradient-to-tr from-rose-500/5 via-transparent to-transparent pointer-events-none select-none" />

      {/* Visual warning logo container */}
      <div className="w-full max-w-xl my-auto p-5 sm:p-8 rounded-3xl bg-[#0f172a] border border-rose-500/25 shadow-[0_0_40px_rgba(244,63,94,0.1)] flex flex-col gap-6 relative z-10 select-none">
        
        {/* Neon warning icon header */}
        <div className="flex items-center gap-4 border-b border-slate-800 pb-5">
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400">
            <AlertOctagon className="h-8 w-8 animate-pulse" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-white tracking-wide uppercase">
              Critical Risk Detected
            </h2>
            <p className="text-xs font-mono text-rose-400 mt-1 uppercase tracking-widest font-bold">
              System Code: HONEYPOT_MALCONTRACT_DETECTED
            </p>
          </div>
        </div>

        {/* Hazard Information text */}
        <div className="flex flex-col gap-4 font-mono text-xs leading-relaxed text-slate-300">
          <p className="text-[13px] font-sans font-semibold text-white leading-relaxed">
            The target contract you are attempting to interact with has failed multiple BANA Institutional Vault security audits. 
          </p>

          <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/20 flex flex-col gap-3 font-sans">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-white text-xs block font-bold">Verified Honeypot Trap</strong>
                <span className="text-slate-400 text-[11px]">The smart contract contains code designed to restrict token transfers. Buyers can purchase, but cannot sell or transfer the assets.</span>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-white text-xs block font-bold">Deployer Blacklisted</strong>
                <span className="text-slate-400 text-[11px]">The contract deployer address holds malicious status alerts on base chain registry indexes.</span>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-white text-xs block font-bold">Dynamic Slippage Drainage</strong>
                <span className="text-slate-400 text-[11px]">Slippage index exceeds 15% due to simulated pool dilution, indicating potential sandwich capital exit.</span>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center bg-slate-950 p-3 rounded-xl border border-slate-800">
            <span className="text-slate-400 text-[11px] font-bold">RISK ASSET TARGET:</span>
            <span className="text-slate-200 font-bold text-[11.5px]">{details.fromAmount} {details.fromSymbol} &rarr; {details.toAmount} {details.toSymbol}</span>
          </div>
        </div>

        {/* User agreement check */}
        <div className="flex items-start gap-3 p-3 bg-slate-950 border border-slate-800 rounded-xl">
          <input
            id="liability-checkbox"
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="w-4.5 h-4.5 mt-0.5 rounded accent-rose-500 cursor-pointer text-rose-500"
          />
          <label htmlFor="liability-checkbox" className="text-xs text-slate-400 cursor-pointer select-none leading-relaxed font-sans">
            I understand that by proceeding, <strong className="text-white">I bypass all BANA firewall rules</strong> and assume full responsibility for any irreversible loss of simulated capital.
          </label>
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          {/* Reject button - must match name exactly */}
          <button
            onClick={handleReject}
            className="flex-1 py-3.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold font-sans text-sm rounded-xl transition-all cursor-pointer text-center"
          >
            Reject
          </button>

          {/* Confirm anyway button - must match name exactly */}
          <button
            onClick={handleConfirmAnyway}
            disabled={!agreed}
            className={`flex-1 py-3.5 rounded-xl font-bold font-sans text-sm transition-all duration-300 border text-center ${
              agreed
                ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-500/50 cursor-pointer shadow-[0_0_15px_rgba(244,63,94,0.25)]'
                : 'bg-rose-950/20 text-slate-500/50 border-rose-950/40 cursor-not-allowed'
            }`}
          >
            Confirm anyway
          </button>
        </div>

      </div>

    </div>
  );
}
