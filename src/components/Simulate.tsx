'use client';

import React, { useState, useEffect } from 'react';
import { Screen, SystemSettings } from '../types';
import { 
  ShieldCheck, 
  ArrowRight, 
  CheckCircle, 
  Play, 
  X, 
  Lock, 
  Unlock, 
  Cpu, 
  Check, 
  AlertTriangle 
} from 'lucide-react';

interface SimulateProps {
  settings: SystemSettings;
  onNavigate: (toScreen: Screen, direction: 'push' | 'push_back' | 'slide_up' | 'none') => void;
  preparedSwap: {
    fromSymbol: string;
    toSymbol: string;
    fromAmount: string;
    toAmount: string;
    isHighRisk: boolean;
    rate: number;
    gasFee: string;
  } | null;
  onConfirmSwap: () => void;
}

export default function Simulate({ 
  settings, 
  onNavigate, 
  preparedSwap,
  onConfirmSwap
}: SimulateProps) {
  const [step1, setStep1] = useState(0); // 0: idle, 1: loading, 2: completed
  const [step2, setStep2] = useState(0); 
  const [step3, setStep3] = useState(0);
  const [step4, setStep4] = useState(0);

  // Fallback defaults if user went directly to this page
  const details = preparedSwap || {
    fromSymbol: 'ETH',
    toSymbol: 'USDC',
    fromAmount: '1.00',
    toAmount: '2,415.82',
    isHighRisk: false,
    rate: 2415.82,
    gasFee: '$12.42'
  };

  // Run simulated audit checklist sequentially on load
  useEffect(() => {
    const timer1 = setTimeout(() => setStep1(2), 600);
    const timer2 = setTimeout(() => setStep2(2), 1200);
    const timer3 = setTimeout(() => setStep3(2), 1800);
    const timer4 = setTimeout(() => setStep4(2), 2400);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
    };
  }, []);

  const handleConfirm = () => {
    // Execute swap simulation (mutes portfolio and adds activity log!)
    onConfirmSwap();
    // Navigate home with push transition
    onNavigate('PORTFOLIO_DASHBOARD', 'push');
  };

  const handleReject = () => {
    onNavigate('SWAP_INTERFACE', 'push_back');
  };

  return (
    <div className="flex-1 min-h-full bg-[#06132a] text-[#d8e2ff] p-4 sm:p-6 lg:p-8 flex flex-col gap-6 overflow-y-auto relative">

      {/* Simulation Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center pb-3 border-b border-[#1E3559]/40">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 block animate-pulse" />
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Transaction Simulation
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-[#8c90a0] mt-1 font-mono">
            Stateful EVM Execution Trace before chain dispatching • Block 20128919
          </p>
        </div>

        {/* Exit absolute trigger */}
        <button
          onClick={handleReject}
          className="self-start sm:self-auto p-1 px-3 border border-[#1E3559] bg-[#112643]/50 hover:bg-[#1e3459] rounded-lg transition-colors cursor-pointer text-[#8c90a0] hover:text-white flex items-center justify-center gap-1 font-mono text-xs"
        >
          <span>close</span>
        </button>
      </header>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-2">
        
        {/* Left column flow and checkpoints list - Width 3/5 */}
        <div className="lg:col-span-3 min-w-0 flex flex-col gap-6">
          
          {/* Visual Asset flow transfer diagram */}
          <div className="p-6 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-5">
            <h3 className="font-sans font-extrabold text-[#d8e2ff] text-sm uppercase tracking-wider">
              Asset Transfer Preview
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center justify-center py-4 bg-[#020d24]/80 border border-[#1e3559]/50 rounded-xl p-4">
              
              {/* Asset leaving */}
              <div className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-red-500/10 bg-red-500/5">
                <span className="text-[10px] uppercase font-mono font-bold text-red-400">LEAVING WALLET</span>
                <span className="text-xl font-bold font-mono text-white text-center">
                  -{details.fromAmount} {details.fromSymbol}
                </span>
                <span className="text-xs text-[#8c90a0] font-mono">My Account (0x71C...)</span>
              </div>

              {/* Connected Arrow */}
              <div className="flex flex-col items-center justify-center p-3 text-[#afc6ff]">
                <div className="w-10 h-10 rounded-full bg-[#112643] border border-[#1E3559] flex items-center justify-center">
                  <ArrowRight className="h-5 w-5 animate-pulse" />
                </div>
                <span className="text-[9px] font-mono text-[#8c90a0] tracking-widest uppercase mt-2">PRIVATE RPC</span>
              </div>

              {/* Asset entering */}
              <div className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-emerald-500/10 bg-emerald-500/5">
                <span className="text-[10px] uppercase font-mono font-bold text-emerald-400">ENTERING WALLET</span>
                <span className="text-xl font-bold font-mono text-emerald-400 text-center">
                  +{details.toAmount} {details.toSymbol}
                </span>
                <span className="text-xs text-[#8c90a0] font-mono">My Account (0x71C...)</span>
              </div>

            </div>
          </div>

          {/* Interactive EVM Security Checkpoints List */}
          <div className="p-6 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-4">
            <h3 className="font-sans font-extrabold text-[#d8e2ff] text-sm uppercase tracking-wider">
              EVM Sandbox Audit Reports
            </h3>

            <div className="flex flex-col gap-3 font-mono text-xs">
              {/* Check 1: Smart contract check */}
              <div className={`p-3.5 rounded-lg border flex items-center justify-between transition-all ${
                step1 === 2 ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-[#020d24]/50 border-[#1E3559]/50'
              }`}>
                <div className="flex items-center gap-3">
                  {step1 === 2 ? (
                    <CheckCircle className="h-4.5 w-4.5 text-emerald-400 shrink-0" />
                  ) : (
                    <span className="w-4.5 h-4.5 rounded-full border-2 border-dashed border-[#528dff]/80 animate-spin shrink-0" />
                  )}
                  <div>
                    <div className="font-bold text-white text-[13px]">Target Contract Security Check</div>
                    <div className="text-[10px] text-[#8c90a0] mt-0.5">Analysing bytecode for honey-pot indicators</div>
                  </div>
                </div>
                <span className="text-emerald-400 font-bold">{step1 === 2 ? 'PASSED' : 'AUDITING...'}</span>
              </div>

              {/* Check 2: Balance checklist */}
              <div className={`p-3.5 rounded-lg border flex items-center justify-between transition-all ${
                step2 === 2 ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-[#020d24]/50 border-[#1E3559]/50'
              }`}>
                <div className="flex items-center gap-3">
                  {step2 === 2 ? (
                    <CheckCircle className="h-4.5 w-4.5 text-emerald-400 shrink-0" />
                  ) : (
                    <span className="w-4.5 h-4.5 rounded-full border-2 border-dashed border-[#528dff]/80 animate-spin shrink-0" />
                  )}
                  <div>
                    <div className="font-bold text-white text-[13px]">Wallet Gas Reserve Sufficiency</div>
                    <div className="text-[10px] text-[#8c90a0] mt-0.5">Estimated gas cost: 110,000 gas units (~$12.42)</div>
                  </div>
                </div>
                <span className="text-emerald-400 font-bold">{step2 === 2 ? 'SAFE' : 'CALCULATING...'}</span>
              </div>

              {/* Check 3: Slippage calculation */}
              <div className={`p-3.5 rounded-lg border flex items-center justify-between transition-all ${
                step3 === 2 ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-[#020d24]/50 border-[#1E3559]/50'
              }`}>
                <div className="flex items-center gap-3">
                  {step3 === 2 ? (
                    <CheckCircle className="h-4.5 w-4.5 text-emerald-400 shrink-0" />
                  ) : (
                    <span className="w-4.5 h-4.5 rounded-full border-2 border-dashed border-[#528dff]/80 animate-spin shrink-0" />
                  )}
                  <div>
                    <div className="font-bold text-white text-[13px]">Slippage Tolerance Protection Map</div>
                    <div className="text-[10px] text-[#8c90a0] mt-0.5">Preset: {settings.selectedSlippage}%. Maximum potential slip: 0.04%</div>
                  </div>
                </div>
                <span className="text-emerald-400 font-bold">{step3 === 2 ? 'EXCELLENT' : 'SOLVING...'}</span>
              </div>

              {/* Check 4: MEV Sandwich resistance */}
              <div className={`p-3.5 rounded-lg border flex items-center justify-between transition-all ${
                step4 === 2 ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-[#020d24]/50 border-[#1E3559]/50'
              }`}>
                <div className="flex items-center gap-3">
                  {step4 === 2 ? (
                    <CheckCircle className="h-4.5 w-4.5 text-emerald-400 shrink-0" />
                  ) : (
                    <span className="w-4.5 h-4.5 rounded-full border-2 border-dashed border-[#528dff]/80 animate-spin shrink-0" />
                  )}
                  <div>
                    <div className="font-bold text-white text-[13px]">MEMPOOL Pre-emptive Protection</div>
                    <div className="text-[10px] text-[#8c90a0] mt-0.5">Private relayer validated via BANA Shield</div>
                  </div>
                </div>
                <span className="text-emerald-400 font-bold">{step4 === 2 ? 'PROTECTED' : 'SHIELDING...'}</span>
              </div>
            </div>
          </div>

        </div>

        {/* Right Action column with details card and click target modal helper - Width 2/5 */}
        <div className="lg:col-span-2 min-w-0 flex flex-col gap-6">
          
          {/* DETAILED SECURITIES ADVISORY CARD */}
          {/* CRITICAL ACTION: XPath lookup asserts element target: body/div[1]/div[1]/div[3] */}
          {/* We place a highly visual, clickable warning/advisory card representing the risk metadata that leads directly */}
          {/* to the Scam Warning Modal on click/tap! */}
          <div 
            onClick={() => onNavigate('SCAM_WARNING_MODAL', 'none')}
            className="p-5 rounded-2xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 hover:border-amber-400/60 shadow-[0_0_20px_rgba(245,158,11,0.1)] cursor-pointer select-none transition-all duration-300 group hover:scale-[1.01]"
            title="Warning Advisory Panel"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/15 rounded-xl text-amber-400 group-hover:rotate-12 transition-transform">
                <AlertTriangle className="h-5.5 w-5.5" />
              </div>
              <h4 className="text-white font-bold text-[15px] group-hover:text-amber-300 transition-colors">
                Audit Advisory Detected
              </h4>
            </div>
            
            <p className="text-xs text-[#8c90a0] mt-3 leading-relaxed">
              Our sandbox flagged <span className="text-amber-400 font-bold">1 warning alert</span> on the contract bytecode representation. Click this panel immediately to audit the potential rug-pull / slippage vulnerability index before executing.
            </p>

            <div className="mt-4 pt-3 border-t border-amber-500/20 flex justify-between items-center text-[10px] font-mono text-amber-400 font-bold">
              <span>SECURITY VULNERABILITY AUDIT</span>
              <span className="flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                EXAMINE VULNERABILITY &rarr;
              </span>
            </div>
          </div>

          {/* Execution details panel */}
          <div className="p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-4 font-mono text-xs">
            <h3 className="font-sans font-extrabold text-[#d8e2ff] text-xs uppercase tracking-wider mb-1">
              Simulation Parameters
            </h3>

            <div className="flex justify-between items-center py-2 border-b border-[#1E3559]/30">
              <span className="text-[#8c90a0]">EVM Executor</span>
              <span className="text-white font-semibold">Tenderly Arch</span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-[#1E3559]/30">
              <span className="text-[#8c90a0]">Consensus Simulation</span>
              <span className="text-emerald-400 font-bold">Consensus Met</span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-[#1E3559]/30">
              <span className="text-[#8c90a0]">Gas Price Guess</span>
              <span className="text-white">35 Gwei</span>
            </div>

            <div className="flex justify-between items-center py-2">
              <span className="text-[#8c90a0]">Execution Route</span>
              <span className="text-white font-bold text-[10px] bg-[#020d24] px-1.5 py-0.5 rounded border border-[#1e3459]">
                Uniswap V3 Relayer
              </span>
            </div>
          </div>

          {/* Main Simulation controls */}
          <div className="p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-3">
            <h4 className="text-sm font-bold text-white tracking-wide">
              Proceed with Transaction?
            </h4>
            <p className="text-xs text-[#8c90a0] mb-2 leading-relaxed">
              Confirming will execute the transaction in full. The assets will be updated immediately. Rejecting will clear the memory and exit.
            </p>

            <div className="flex flex-col gap-2.5">
              {/* Confirm trigger */}
              <button
                onClick={handleConfirm}
                className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold font-sans text-sm rounded-xl transition-all duration-300 border border-emerald-400/40 cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.25)] select-none"
              >
                Confirm
              </button>

              {/* Reject trigger */}
              <button
                onClick={handleReject}
                className="w-full py-3.5 bg-[#020d24]/60 hover:bg-[#112643] text-[#ffb4ab] hover:text-white font-bold font-sans text-sm rounded-xl transition-all duration-300 border border-[#1E3559]/80 cursor-pointer shadow-sm select-none"
              >
                Reject
              </button>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
