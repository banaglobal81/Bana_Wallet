import React, { useState, useEffect } from 'react';
import { Asset, SystemSettings } from '../types';
import {
  TrendingUp,
  TrendingDown,
  HelpCircle,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronRight,
  Download,
  Upload,
  Layers,
  Sparkles
} from 'lucide-react';
import Notifications from './Notifications';
import ProfileMenu from './ProfileMenu';

interface DashboardProps {
  assets: Asset[];
  settings: SystemSettings;
  onNavigate: (toScreen: any, direction: any) => void;
}

export default function Dashboard({ assets, settings, onNavigate }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<'All' | 'Ethereum' | 'Base' | 'Arbitrum'>('All');
  const [selectedTimeframe, setSelectedTimeframe] = useState<'1D' | '1W' | '1M' | '1Y'>('1W');
  const [hoveredAsset, setHoveredAsset] = useState<string | null>(null);
  
  // Custom interactive chart cursor state
  const [chartCursor, setChartCursor] = useState<{ index: number; value: number } | null>(null);

  // Asset-allocation help popover
  const [showAllocInfo, setShowAllocInfo] = useState(false);

  // Timeframe-specific data mock for BANA portfolio history chart
  const timeframeData = {
    '1D': [24110, 24150, 24080, 24190, 24220, 24318.55],
    '1W': [23800, 23950, 23720, 24100, 24050, 24180, 24318.55],
    '1M': [22500, 23100, 22900, 23400, 23800, 24100, 24318.55],
    '1Y': [18200, 19500, 21200, 20400, 22800, 23500, 24318.55],
  };

  const chartPoints = timeframeData[selectedTimeframe];

  // Helper to filter assets
  const filteredAssets = assets.filter((asset) => {
    if (activeTab === 'All') return true;
    if (activeTab === 'Ethereum') return asset.chain === 'MAINNET' || asset.chain === 'ETHEREUM';
    if (activeTab === 'Base') return asset.chain === 'BASE' || asset.chain === 'MULTI-CHAIN';
    if (activeTab === 'Arbitrum') return asset.chain === 'ARBITRUM';
    return true;
  });

  const totalValue = assets.reduce((sum, item) => sum + item.holdings * item.price, 0);

  // Quick helper to render custom crypto coin icon/logo elements inside table rows
  const renderMiniLogo = (symbol: string) => {
    switch (symbol) {
      case 'ETH':
        return (
          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-indigo-400/30">
            <span className="text-xs font-bold text-indigo-300">Ξ</span>
          </div>
        );
      case 'USDC':
        return (
          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-blue-400/30">
            <span className="text-xs font-bold text-blue-400">$</span>
          </div>
        );
      case 'LINK':
        return (
          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-sky-400/30">
            <span className="text-[11px] font-bold text-sky-400">LK</span>
          </div>
        );
      case 'ARB':
        return (
          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-cyan-400/30">
            <span className="text-[11px] font-bold text-cyan-300">AR</span>
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-600">
            <span className="text-[11px] font-bold text-slate-300">{symbol.slice(0, 2)}</span>
          </div>
        );
    }
  };

  return (
    <div className="flex-1 min-h-full bg-[#020617] text-slate-100 p-4 sm:p-6 lg:p-8 flex flex-col gap-6 overflow-y-auto">
      {/* 1. Header Bar */}
      <header className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center bg-[#020617]">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex flex-wrap items-center gap-2">
            Portfolio Dashboard
            <span className="text-[10px] sm:text-xs font-mono font-bold bg-indigo-500/10 px-2.5 py-0.5 rounded text-indigo-400 uppercase tracking-widest border border-indigo-500/20">
              SECURED WITH BENTO
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-mono break-all">
            Vault Router v3.4 • Verified Address: {settings.connectedWallet.slice(0, 10)}...{settings.connectedWallet.slice(-6)}
          </p>
        </div>

        {/* Action Widgets */}
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
          <button
            onClick={() => onNavigate('WALLET_INTERFACE', 'push')}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/60 text-slate-200 rounded-xl font-bold text-sm transition-all duration-200 flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <Download className="h-4 w-4 text-slate-400" />
            Receive
          </button>

          <button
            onClick={() => onNavigate('WALLET_INTERFACE', 'push')}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm transition-all duration-200 flex items-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(99,102,241,0.25)] border border-indigo-500/30"
          >
            <Upload className="h-4 w-4" />
            Send
          </button>

          <div className="h-10 w-[1px] bg-slate-850 mx-1" />

          {/* Working notifications dropdown */}
          <Notifications />

          {/* Working profile menu */}
          <ProfileMenu
            settings={settings}
            onNavigate={onNavigate}
          />
        </div>
      </header>

      {/* 2. Top Summary Metrics Card */}
      <section className="shrink-0 p-5 sm:p-8 rounded-3xl bg-slate-900 border border-slate-800 relative overflow-hidden shadow-xl bento-hover">
        {/* Glow corner detail */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-indigo-500/5 via-transparent to-transparent pointer-events-none" />
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          <div>
            <span className="text-xs font-mono text-slate-400 uppercase tracking-widest font-bold">
              Total Portfolio Value
            </span>
            <div className="flex items-baseline gap-2 mt-2">
              <h2 className="text-3xl sm:text-4xl xl:text-5xl font-black font-sans tracking-tight text-white whitespace-nowrap">
                ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h2>
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <TrendingUp className="h-3.5 w-3.5" />
                +4.2%
              </span>
            </div>
          </div>

          <div className="border-t border-slate-800 md:border-t-0 md:border-l md:pl-8 py-1">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-widest font-bold">
              Daily Volume
            </span>
            <p className="text-2xl font-bold font-sans text-slate-200 mt-1.5">
              $12,402.10
            </p>
          </div>

          <div className="border border-indigo-500/10 rounded-2xl bg-indigo-500/5 md:border-none md:rounded-none md:bg-transparent md:border-l md:pl-8 py-3 px-4 md:py-1 md:px-0">
            <span className="text-xs font-mono text-indigo-300 md:text-slate-400 uppercase tracking-widest font-bold">
              Active Security Vaults
            </span>
            <p className="text-2xl font-bold font-sans text-indigo-400 md:text-slate-200 mt-1.5 flex items-center gap-2">
              08
              <span className="text-[10px] bg-indigo-500/10 text-indigo-400 font-bold border border-indigo-500/20 px-1.5 py-0.5 rounded uppercase font-sans">
                POLICED
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* 3. Main Split Board Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column (Allocations & Valuation History) - Width 5/12 */}
        <div className="lg:col-span-5 min-w-0 flex flex-col gap-6">
          
          {/* Asset Allocation Donut Chart */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col gap-4 bento-hover shadow-lg">
            <div className="flex justify-between items-center">
              <h3 className="font-sans font-bold text-slate-100 text-[15px] uppercase tracking-wider">
                Asset Allocation
              </h3>
              <div className="relative">
                <button
                  onClick={() => setShowAllocInfo((v) => !v)}
                  aria-label="What is asset allocation?"
                  aria-expanded={showAllocInfo}
                  className={`p-1 transition-colors cursor-pointer ${showAllocInfo ? 'text-indigo-400' : 'text-slate-400 hover:text-white'}`}
                >
                  <HelpCircle className="h-4 w-4" />
                </button>

                {showAllocInfo && (
                  <>
                    {/* click-away catcher */}
                    <div className="fixed inset-0 z-40" onClick={() => setShowAllocInfo(false)} />
                    <div className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-3rem)] p-3.5 bg-slate-950 border border-slate-700 rounded-xl shadow-2xl shadow-black/40 z-50 text-left">
                      <p className="text-[12px] font-bold text-white mb-1">Asset Allocation</p>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        How your portfolio is split across tokens, by percentage of total value.
                        Hover a ring segment to see that token's share. Rebalance via Swap to adjust it.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Interactive Donut Construct */}
            <div className="flex items-center gap-6 justify-center py-2 h-44">
              <div className="relative w-36 h-36">
                <svg viewBox="0 0 100 100" className="w-[100%] h-[100%] transform -rotate-90">
                  {/* ETH loop (42%) -> Length = 2 * PI * 38 = 238.76. 42% = 100.28, offset 0 */}
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    stroke="#6366f1"
                    strokeWidth="11"
                    strokeDasharray="100.28 138.48"
                    strokeDashoffset="0"
                    fill="transparent"
                    className="transition-all duration-300 hover:stroke-[13px] cursor-pointer"
                    onMouseEnter={() => setHoveredAsset('ETH')}
                    onMouseLeave={() => setHoveredAsset(null)}
                  />
                  {/* USDC loop (28%) -> USDC: emerald-500 */}
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    stroke="#10b981"
                    strokeWidth="11"
                    strokeDasharray="66.85 171.91"
                    strokeDashoffset="-100.28"
                    fill="transparent"
                    className="transition-all duration-300 hover:stroke-[13px] cursor-pointer"
                    onMouseEnter={() => setHoveredAsset('USDC')}
                    onMouseLeave={() => setHoveredAsset(null)}
                  />
                  {/* LINK loop (18%) -> LINK: amber-500 */}
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    stroke="#f59e0b"
                    strokeWidth="11"
                    strokeDasharray="42.98 195.78"
                    strokeDashoffset="-167.13"
                    fill="transparent"
                    className="transition-all duration-300 hover:stroke-[13px] cursor-pointer"
                    onMouseEnter={() => setHoveredAsset('LINK')}
                    onMouseLeave={() => setHoveredAsset(null)}
                  />
                  {/* Others loop (12%) -> Others: purple-500 */}
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    stroke="#a855f7"
                    strokeWidth="11"
                    strokeDasharray="28.65 210.11"
                    strokeDashoffset="-210.11"
                    fill="transparent"
                    className="transition-all duration-300 hover:stroke-[13px] cursor-pointer"
                    onMouseEnter={() => setHoveredAsset('Others')}
                    onMouseLeave={() => setHoveredAsset(null)}
                  />
                </svg>

                {/* Inner Overlay with dynamic text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
                  <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wide">
                    {hoveredAsset ? hoveredAsset : 'Tokens'}
                  </span>
                  <span className="text-xl font-bold font-mono text-white mt-0.5">
                    {hoveredAsset === 'ETH' && '42%'}
                    {hoveredAsset === 'USDC' && '28%'}
                    {hoveredAsset === 'LINK' && '18%'}
                    {hoveredAsset === 'Others' && '12%'}
                    {!hoveredAsset && '12'}
                  </span>
                </div>
              </div>

              {/* Custom Legends */}
              <div className="flex flex-col gap-2 font-mono text-xs select-none">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 block" />
                  <span className="text-slate-400">ETH (42%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 block" />
                  <span className="text-slate-400">USDC (28%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 block" />
                  <span className="text-slate-400">LINK (18%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500 block" />
                  <span className="text-slate-400">Others (12%)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Balance Valuation History Card */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col gap-3 bento-hover shadow-lg">
            <div className="flex justify-between items-center">
              <h3 className="font-sans font-bold text-slate-100 text-[15px] uppercase tracking-wider">
                Valuation History
              </h3>
              
              {/* Timeframes */}
              <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                {(['1D', '1W', '1M', '1Y'] as const).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => {
                       setSelectedTimeframe(tf);
                       setChartCursor(null);
                    }}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-bold font-sans transition-all cursor-pointer ${
                      selectedTimeframe === tf
                        ? 'bg-[#6366f1] text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {/* Glowing Custom Area Chart */}
            <div className="h-32 mt-2 w-full relative">
              <svg 
                viewBox="0 0 200 80" 
                className="w-full h-full"
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const ratio = Math.max(0, Math.min(1, x / rect.width));
                  const index = Math.round(ratio * (chartPoints.length - 1));
                  setChartCursor({ index, value: chartPoints[index] });
                }}
                onMouseLeave={() => setChartCursor(null)}
              >
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Grid guidelines */}
                <line x1="0" y1="20" x2="200" y2="20" stroke="#1e293b" strokeWidth="0.25" strokeDasharray="3 3" />
                <line x1="0" y1="50" x2="200" y2="50" stroke="#1e293b" strokeWidth="0.25" strokeDasharray="3 3" />

                {/* Generate polyline points path */}
                {(() => {
                  const minVal = Math.min(...chartPoints) * 0.98;
                  const maxVal = Math.max(...chartPoints) * 1.02;
                  const points = chartPoints.map((val, idx) => {
                    const x = (idx / (chartPoints.length - 1)) * 200;
                    const y = 80 - ((val - minVal) / (maxVal - minVal)) * 60 - 5;
                    return { x, y, val };
                  });

                  const pathD = `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`;
                  const areaD = `${pathD} L 200,80 L 0,80 Z`;

                  return (
                    <>
                      {/* Gradient Fill under path line */}
                      <path d={areaD} fill="url(#chartGradient)" />

                      {/* Smooth Stroke Line */}
                      <path d={pathD} fill="none" stroke="#6366f1" strokeWidth="1.7" strokeLinecap="round" />

                      {/* Animated/Interactive circles */}
                      {points.map((p, idx) => (
                        <circle
                          key={idx}
                          cx={p.x}
                          cy={p.y}
                          r={chartCursor?.index === idx ? '3.5' : '1.5'}
                          fill={chartCursor?.index === idx ? '#ffffff' : '#6366f1'}
                          stroke="#0f172a"
                          strokeWidth="1"
                          className="transition-all duration-150"
                        />
                      ))}
                    </>
                  );
                })()}
              </svg>

              {/* Price detail hover card */}
              <div className="absolute right-2 bottom-0 flex items-center gap-1.5 font-mono text-xs select-none">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 block animate-ping" />
                <span className="text-slate-400">Valuation:</span>
                <span className="text-white font-bold">
                  ${chartCursor ? chartCursor.value.toLocaleString('en-US') : totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (Vault Assets Table) - Width 7/12 */}
        <div className="lg:col-span-7 min-w-0 p-6 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col justify-between bento-hover shadow-lg">
          <div>
            {/* Header with quick filters */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 border-b border-slate-800 pb-4">
              <h3 className="font-sans font-bold text-slate-100 text-[15px] uppercase tracking-wider">
                Current Assets
              </h3>

              <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800 self-start">
                {(['All', 'Ethereum', 'Base', 'Arbitrum'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1 rounded-md text-[10px] font-extrabold font-sans transition-all cursor-pointer ${
                      activeTab === tab
                        ? 'bg-[#6366f1] text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Responsive Table Layout */}
            <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full min-w-[520px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800/80 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                    <th className="pb-3 font-semibold">Token</th>
                    <th className="pb-3 font-semibold">Chain</th>
                    <th className="pb-3 text-right font-semibold">Price</th>
                    <th className="pb-3 text-right font-semibold">24h%</th>
                    <th className="pb-3 text-right font-semibold">Holdings</th>
                    <th className="pb-3 text-right font-semibold">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {filteredAssets.map((asset) => {
                    const isPositive = asset.change24h >= 0;
                    return (
                      <tr 
                        key={asset.id} 
                        className="hover:bg-slate-800/30 transition-colors group cursor-pointer"
                      >
                        {/* Token name & representation */}
                        <td className="py-3.5 pr-2">
                           <div className="flex items-center gap-3">
                            {renderMiniLogo(asset.symbol)}
                            <div>
                              <div className="font-semibold text-[15px] text-white group-hover:text-indigo-400 transition-colors">
                                {asset.name}
                              </div>
                              <span className="font-mono text-xs text-slate-400">{asset.symbol}</span>
                            </div>
                          </div>
                        </td>

                        {/* Network chain indicator */}
                        <td className="py-3.5 px-2">
                          <span className={`inline-block px-1.5 py-0.5 rounded font-mono text-[9px] font-bold ${
                            asset.chain === 'MAINNET' || asset.chain === 'ETHEREUM'
                              ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30'
                              : asset.chain === 'BASE' || asset.chain === 'MULTI-CHAIN'
                              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30'
                              : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                          }`}>
                            {asset.chain}
                          </span>
                        </td>

                        {/* Cost */}
                        <td className="py-3.5 px-2 text-right font-mono text-xs text-white">
                          ${asset.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* Status change representation */}
                        <td className="py-3.5 px-2 text-right">
                          <div className={`inline-flex items-center gap-0.5 font-mono text-xs font-semibold ${
                            isPositive ? 'text-emerald-400' : 'text-rose-400'
                          }`}>
                            {isPositive ? '+' : ''}{asset.change24h}%
                          </div>
                        </td>

                        {/* Assets amount */}
                        <td className="py-3.5 px-2 text-right font-mono text-xs text-white">
                          <div>{asset.holdings.toLocaleString('en-US')}</div>
                          <span className="text-[10px] text-slate-400">{asset.symbol}</span>
                        </td>

                        {/* Asset total pricing */}
                        <td className="py-3.5 pl-2 text-right font-mono text-xs font-bold text-white group-hover:translate-x-[-2px] transition-transform">
                          ${(asset.holdings * asset.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-slate-800 flex justify-between items-center text-xs">
            <span className="text-slate-400">Showing {filteredAssets.length} of {assets.length} assets</span>
            
            {/* View All Assets triggers screen transition */}
            <a 
              href="#swap" 
              onClick={(e) => {
                e.preventDefault();
                onNavigate('SWAP_INTERFACE', 'push');
              }}
              className="text-indigo-400 hover:text-indigo-300 font-bold font-sans flex items-center gap-1 group/link transition-colors cursor-pointer"
            >
              <span>View All Assets</span>
              <ChevronRight className="h-4 w-4 group-hover/link:translate-x-0.5 transition-transform" />
            </a>
          </div>

        </div>
      </div>

      {/* 4. Mini Security Alert Overlay card info */}
      <footer className="mt-auto bg-indigo-500/5 border border-indigo-500/10 p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 select-none">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400">
            <Sparkles className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white tracking-wide">
              Hardware Wallet Integration Guard Active
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Secure private keys remain strictly off-network. High-precision hardware consensus algorithms verified.
            </p>
          </div>
        </div>
        <div className="text-xs font-mono font-bold text-indigo-400 border border-indigo-500/25 px-3 py-1.5 rounded-xl bg-indigo-500/5">
          Consensus: SECURE
        </div>
      </footer>
    </div>
  );
}
