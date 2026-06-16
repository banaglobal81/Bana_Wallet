import React, { useState } from 'react';
import { Screen, Asset, SystemSettings } from '../types';
import { 
  ArrowUpDown, 
  Settings as SettingsIcon, 
  ShieldAlert, 
  ShieldCheck, 
  Info, 
  HelpCircle,
  TrendingDown,
  Activity,
  ChevronDown
} from 'lucide-react';

interface SwapProps {
  assets: Asset[];
  settings: SystemSettings;
  onNavigate: (toScreen: Screen, direction: 'push' | 'push_back' | 'slide_up' | 'none') => void;
  onPrepareSwap: (payload: {
    fromSymbol: string;
    toSymbol: string;
    fromAmount: string;
    toAmount: string;
    isHighRisk: boolean;
    rate: number;
    gasFee: string;
  }) => void;
}

export default function Swap({ assets, settings, onNavigate, onPrepareSwap }: SwapProps) {
  const [fromAsset, setFromAsset] = useState<string>('ETH');
  const [toAsset, setToAsset] = useState<string>('USDC');
  const [payAmount, setPayAmount] = useState<string>('1.00');
  
  // Custom Scenario Switcher
  const [isHighRiskScenario, setIsHighRiskScenario] = useState<boolean>(false);
  const [slippage, setSlippage] = useState<string>(settings.selectedSlippage);

  // Exchange rate definitions
  const rates: Record<string, Record<string, number>> = {
    ETH: { USDC: 2415.82, LINK: 131.15, ARB: 1220.0, ETH: 1 },
    USDC: { ETH: 0.000414, LINK: 0.0543, ARB: 0.505, USDC: 1 },
    LINK: { ETH: 0.00762, USDC: 18.42, ARB: 9.3, LINK: 1 },
    ARB: { ETH: 0.00082, USDC: 1.98, LINK: 0.1075, ARB: 1 },
  };

  const getBalance = (symbol: string) => {
    const found = assets.find(a => a.symbol === symbol);
    return found ? found.holdings : 0;
  };

  const handlePayAmountChange = (val: string) => {
    // Basic number normalization
    setPayAmount(val);
  };

  // Convert rate
  const currentRate = rates[fromAsset]?.[toAsset] || 1;
  const receiveAmount = (parseFloat(payAmount) || 0) * currentRate;

  const handleMaxClick = () => {
    const bal = getBalance(fromAsset);
    setPayAmount(bal.toString());
  };

  const swapTokens = () => {
    const temp = fromAsset;
    setFromAsset(toAsset);
    setToAsset(temp);
  };

  // Execute swap initiation
  const handleReviewSwapClick = () => {
    if (!payAmount || parseFloat(payAmount) <= 0) return;

    // Package the transaction details
    onPrepareSwap({
      fromSymbol: fromAsset,
      toSymbol: toAsset,
      fromAmount: payAmount,
      toAmount: receiveAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      isHighRisk: isHighRiskScenario,
      rate: currentRate,
      gasFee: '$12.42'
    });

    // Handle transition targets exactly per script navigation requirements
    if (isHighRiskScenario) {
      onNavigate('SCAM_WARNING_MODAL', 'slide_up');
    } else {
      onNavigate('TRANSACTION_SIMULATION', 'slide_up');
    }
  };

  return (
    <div className="flex-1 min-h-full bg-[#06132a] text-[#d8e2ff] p-4 sm:p-6 lg:p-8 flex flex-col gap-6 overflow-y-auto">

      {/* Page Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center pb-2 border-b border-[#1E3559]/40">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Swap Assets
          </h1>
          <p className="text-xs sm:text-sm text-[#8c90a0] mt-1 font-mono">
            Direct liquidity routing with private MEV Shielding. No sandboxing.
          </p>
        </div>

        {/* Security level badge */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/25 rounded-lg text-emerald-400 font-semibold text-xs font-mono select-none self-start sm:self-auto">
          <ShieldCheck className="h-4 w-4" /> MEV GUARD ON
        </div>
      </header>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-2">
        
        {/* Left main Swap Card - Width 3/5 */}
        <div className="lg:col-span-3 min-w-0 flex flex-col gap-5">
          <div className="p-6 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-4 relative">
            
            {/* Inner Title bar */}
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-sans font-extrabold uppercase text-[#afc6ff] tracking-wider">
                Swap
              </span>
              <button 
                onClick={() => onNavigate('SETTINGS_INTERFACE', 'push')}
                className="p-1.5 text-[#8c90a0] hover:text-white hover:bg-[#1e3459]/50 rounded-lg transition-colors cursor-pointer"
              >
                <SettingsIcon className="h-4 w-4" />
              </button>
            </div>

            {/* YOU PAY FIELD */}
            <div className="p-4 rounded-xl bg-[#020d24]/80 border border-[#1E3559] flex flex-col gap-2">
              <div className="flex justify-between text-xs font-mono text-[#8c90a0]">
                <span>YOU PAY</span>
                <span className="flex items-center gap-1">
                  Balance: {getBalance(fromAsset).toLocaleString('en-US')} {fromAsset}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 mt-1">
                <input
                  type="text"
                  value={payAmount}
                  onChange={(e) => handlePayAmountChange(e.target.value)}
                  className="bg-transparent text-xl font-bold font-mono text-white focus:outline-none w-1/2"
                  placeholder="0.00"
                />
                
                {/* Token Selector */}
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleMaxClick}
                    className="px-2 py-1 bg-[#112643] hover:bg-[#1e3459] border border-[#1E3559] hover:border-[#528dff]/40 text-[#528dff] hover:text-white rounded text-[10px] font-bold transition-all cursor-pointer"
                  >
                    MAX
                  </button>
                  <select 
                    value={fromAsset}
                    onChange={(e) => setFromAsset(e.target.value)}
                    className="bg-[#112643] border border-[#1E3559] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none cursor-pointer"
                  >
                    <option value="ETH">ETH</option>
                    <option value="USDC">USDC</option>
                    <option value="LINK">LINK</option>
                    <option value="ARB">ARB</option>
                  </select>
                </div>
              </div>
            </div>

            {/* CONCENTRIC SWAP TRIGGERS */}
            <div className="relative flex justify-center -my-3 z-10">
              <button 
                onClick={swapTokens}
                className="p-2 rounded-xl bg-[#2E7DFF] hover:bg-[#528dff] border border-[#528dff]/50 text-white shadow-[0_0_12px_rgba(46,125,255,0.4)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                <ArrowUpDown className="h-4 w-4" />
              </button>
            </div>

            {/* YOU RECEIVE FIELD */}
            <div className="p-4 rounded-xl bg-[#020d24]/80 border border-[#1E3559] flex flex-col gap-2">
              <div className="flex justify-between text-xs font-mono text-[#8c90a0]">
                <span>YOU RECEIVE</span>
                <span className="flex items-center gap-1">
                  Balance: {getBalance(toAsset).toLocaleString('en-US')} {toAsset}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 mt-1">
                <div className="text-xl font-bold font-mono text-emerald-400">
                  {receiveAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                </div>

                {/* Token Selection output */}
                <select 
                  value={toAsset}
                  onChange={(e) => setToAsset(e.target.value)}
                  className="bg-[#112643] border border-[#1E3559] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none cursor-pointer"
                >
                  <option value="USDC">USDC</option>
                  <option value="ETH">ETH</option>
                  <option value="LINK">LINK</option>
                  <option value="ARB">ARB</option>
                </select>
              </div>
            </div>

            {/* DYNAMIC SCENARIO SWITCHER FOR SECURITY REVIEW PREVIEWS */}
            <div className="p-4 rounded-xl bg-[#1e2a42]/30 border border-[#528dff]/20 flex flex-col gap-2.5 mt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#afc6ff] flex items-center gap-1.5 uppercase font-sans tracking-wide">
                  <ShieldAlert className="h-4 w-4 text-[#f59e0b]" /> Security Simulation Parameters
                </span>
                <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold font-mono ${
                  isHighRiskScenario ? 'bg-rose-500/15 text-rose-300' : 'bg-emerald-500/15 text-emerald-300'
                }`}>
                  {isHighRiskScenario ? 'RISKY / HONEYPOT' : 'STANDARD CONTRACT'}
                </span>
              </div>
              <p className="text-xs text-[#8c90a0]">
                Swap can route through dynamic assets. Toggle this to audit our system's reaction inside the simulator!
              </p>
              
              <div className="flex flex-col sm:flex-row gap-2.5 mt-1 select-none">
                <button
                  onClick={() => setIsHighRiskScenario(false)}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                    !isHighRiskScenario
                      ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/10 border-emerald-500/35 text-emerald-400'
                      : 'bg-[#020d24]/50 border-transparent text-[#8c90a0] hover:text-white'
                  }`}
                >
                  Standard Approved Asset
                </button>
                <button
                  onClick={() => setIsHighRiskScenario(true)}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                    isHighRiskScenario
                      ? 'bg-gradient-to-r from-red-500/20 to-orange-500/10 border-red-500/35 text-red-400'
                      : 'bg-[#020d24]/50 border-transparent text-[#8c90a0] hover:text-white'
                  }`}
                >
                  Unverified High-Risk Asset
                </button>
              </div>
            </div>

            {/* PRIMARY CALL TO ACTION */}
            <button
              onClick={handleReviewSwapClick}
              disabled={!payAmount || parseFloat(payAmount) <= 0}
              className={`w-full mt-2 py-4 rounded-xl font-sans font-bold text-base text-center transition-all duration-300 border flex items-center justify-center gap-2 cursor-pointer ${
                (!payAmount || parseFloat(payAmount) <= 0)
                  ? 'bg-[#112643]/30 border-[#1E3559] text-[#8c90a0]/60 cursor-not-allowed'
                  : 'bg-gradient-to-r from-[#0059c7] to-[#2E7DFF] hover:from-[#2e7dff] hover:to-[#528dff] text-white border-[#528dff]/50 shadow-[0_0_20px_rgba(46,125,255,0.3)] hover:scale-[1.01] active:scale-100'
              }`}
            >
              Review Swap
            </button>
          </div>
        </div>

        {/* Right Details Column - Width 2/5 */}
        <div className="lg:col-span-2 min-w-0 flex flex-col gap-6">
          
          {/* MEV Protected Status Panel */}
          <div className="p-5 rounded-2xl bg-[#112643]/60 border border-[#1E3559] flex items-start gap-4">
            <div className="p-3 bg-[#528dff]/15 rounded-xl text-[#528dff] shrink-0 mt-0.5">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-white font-bold text-[15px]">MEV Protected</h4>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-sky-500/15 text-sky-400 font-mono font-bold uppercase tracking-wider border border-sky-500/20">
                  ACTIVE
                </span>
              </div>
              <p className="text-xs text-[#8c90a0] mt-1 line-clamp-2">
                Your transaction is routed through a private RPC to skip sandwich attacks, frontrunning, and slippage leakages.
              </p>
            </div>
          </div>

          {/* Core Transaction Parameters */}
          <div className="p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-4 font-mono text-xs">
            <h3 className="font-sans font-extrabold text-[#d8e2ff] text-xs uppercase tracking-wider mb-1">
              Transaction Route Parameters
            </h3>

            <div className="flex justify-between items-center py-2 border-b border-[#1E3559]/30">
              <span className="text-[#8c90a0]">Exchange Rate</span>
              <span className="text-white font-bold">1 {fromAsset} = {currentRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {toAsset}</span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-[#1E3559]/30">
              <span className="text-[#8c90a0] flex items-center gap-1">
                Price Impact <Info className="h-3 w-3" />
              </span>
              <span className="text-emerald-400 font-bold">0.12%</span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-[#1E3559]/30">
              <span className="text-[#8c90a0]">Swap Fee</span>
              <span className="text-white font-bold">0.25%</span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-[#1E3559]/30">
              <span className="text-[#8c90a0]">Network Gas Estimate</span>
              <span className="text-white font-bold">$12.42</span>
            </div>

            {/* Slippage tolerance list */}
            <div className="pt-2 flex flex-col gap-2 font-sans">
              <span className="text-xs font-mono text-[#8c90a0] flex items-center gap-1.5 uppercase font-bold">
                Slippage Tolerance: <span className="text-white font-bold">{slippage}%</span>
              </span>
              
              <div className="grid grid-cols-4 gap-2 text-xs select-none">
                {['0.1', '0.5', '1.0'].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setSlippage(preset)}
                    className={`py-1.5 rounded-lg border text-center font-bold transition-all cursor-pointer ${
                      slippage === preset
                        ? 'bg-[#2E7DFF] text-white border-transparent'
                        : 'bg-[#020d24]/60 text-[#8c90a0] border-[#1E3559] hover:text-white'
                    }`}
                  >
                    {preset}%
                  </button>
                ))}
                <button
                  onClick={() => setSlippage('Custom')}
                  className={`py-1.5 rounded-lg border text-center font-bold transition-all cursor-pointer ${
                    slippage !== '0.1' && slippage !== '0.5' && slippage !== '1.0'
                      ? 'bg-[#2E7DFF] text-white border-transparent'
                      : 'bg-[#020d24]/60 text-[#8c90a0] border-[#1E3559] hover:text-white'
                  }`}
                >
                  Custom
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Routing Flowchart representation */}
          <div className="p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-3 font-mono text-xs">
            <h3 className="font-sans font-extrabold text-[#d8e2ff] text-xs uppercase tracking-wider">
              Transaction Route
            </h3>
            
            <div className="flex items-center justify-between p-3 bg-[#020d24]/60 border border-[#1E3559] rounded-xl text-[10px]">
              <div className="flex flex-col items-center gap-1">
                <span className="text-[#528dff] font-bold">Vault</span>
                <span className="text-white">BANA Port</span>
              </div>
              <div className="text-[#8c90a0] select-none">&rarr;</div>
              <div className="flex flex-col items-center gap-1 px-2.5 py-1 bg-[#112643] border border-[#528dff]/20 rounded-md">
                <span className="text-purple-300 font-bold">UNISWAP V3</span>
                <span className="text-white text-[9px]">Optimal Pool</span>
              </div>
              <div className="text-[#8c90a0] select-none">&rarr;</div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-emerald-400 font-bold">Safe Guard</span>
                <span className="text-white">Routed</span>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
