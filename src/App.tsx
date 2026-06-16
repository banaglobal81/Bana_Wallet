import React, { useState } from 'react';
import { Menu } from 'lucide-react';
import { Screen, Asset, Activity, SystemSettings } from './types';
import { INITIAL_ASSETS, INITIAL_ACTIVITIES, DEFAULT_SETTINGS } from './mockData';
import Sidebar from './components/Sidebar';
import BanaLogo from './components/BanaLogo';
import Dashboard from './components/Dashboard';
import Swap from './components/Swap';
import Staking from './components/Staking';
import Wallet from './components/Wallet';
import Deposit from './components/Deposit';
import Withdraw from './components/Withdraw';
import Simulate from './components/Simulate';
import Settings from './components/Settings';
import ActivityHistory from './components/ActivityHistory';
import ScamWarning from './components/ScamWarning';

// Frame motion imports (motion/react is used for animations)
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [screen, setScreen] = useState<Screen>('PORTFOLIO_DASHBOARD');
  const [transitionDirection, setTransitionDirection] = useState<'push' | 'push_back' | 'slide_up' | 'none'>('push');

  // Mobile navigation drawer state (sidebar collapses below the lg breakpoint)
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Ledger state variables
  const [assets, setAssets] = useState<Asset[]>(INITIAL_ASSETS);
  const [activities, setActivities] = useState<Activity[]>(INITIAL_ACTIVITIES);
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);

  // Buffer state to pass details into simulators
  const [preparedSwap, setPreparedSwap] = useState<{
    fromSymbol: string;
    toSymbol: string;
    fromAmount: string;
    toAmount: string;
    isHighRisk: boolean;
    rate: number;
    gasFee: string;
  } | null>(null);

  // Transitions controller
  const navigate = (toScreen: Screen, direction: 'push' | 'push_back' | 'slide_up' | 'none') => {
    setTransitionDirection(direction);
    setScreen(toScreen);
  };

  const handleUpdateSettings = (updater: Partial<SystemSettings>) => {
    setSettings((prev) => ({ ...prev, ...updater }));
  };


  // Prepare active swap payload
  const handlePrepareSwap = (payload: typeof preparedSwap) => {
    setPreparedSwap(payload);
  };

  // Mutates assets holdings and appends activity upon successful swap
  const handleConfirmSwapExec = () => {
    if (!preparedSwap) return;

    const { fromSymbol, toSymbol, fromAmount, toAmount, isHighRisk } = preparedSwap;
    const fromVal = parseFloat(fromAmount) || 0;
    // Clean string representations e.g. "1,085.40"
    const toVal = parseFloat(toAmount.replace(/,/g, '')) || 0;

    // 1. Mutate balances
    setAssets((prevAssets) =>
      prevAssets.map((asset) => {
        if (asset.symbol === fromSymbol) {
          const nextHoldings = Math.max(0, asset.holdings - fromVal);
          return {
            ...asset,
            holdings: nextHoldings,
            value: nextHoldings * asset.price,
          };
        }
        if (asset.symbol === toSymbol) {
          const nextHoldings = asset.holdings + toVal;
          return {
            ...asset,
            holdings: nextHoldings,
            value: nextHoldings * asset.price,
          };
        }
        return asset;
      })
    );

    // 2. Append action log
    const randomTxCode = Math.floor(1000 + Math.random() * 9000);
    const newRecord: Activity = {
      id: `tx-sim-${Date.now()}`,
      type: 'Swap',
      title: `Swapped ${fromAmtStr(fromVal)} ${fromSymbol} for ${toAmount} ${toSymbol}`,
      description: isHighRisk 
        ? 'Bypassed high-risk contract firewall. Executed via explicit security waiver'
        : 'Executed successfully via private Relayer & Uniswap pool routing',
      fromAmount: fromAmtStr(fromVal),
      fromSymbol,
      toAmount,
      toSymbol,
      timestamp: '2026-06-15 02:04 UTC',
      status: 'Completed',
      txHash: `0x${randomTxCode.toString(16)}65...b${randomTxCode}`,
      gasFee: settings.networkGas === 'Standard' ? '$4.50' : settings.networkGas === 'Fast' ? '$12.42' : '$25.00',
    };

    setActivities((prev) => [newRecord, ...prev]);
    setPreparedSwap(null);
  };

  const fromAmtStr = (num: number) => {
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  };

  // Dynamic Framer Motion custom viewport transition styles
  // Maps push, push_back, slide_up, and none transition styles dynamically
  const variants = {
    initial: (type: typeof transitionDirection) => {
      if (type === 'push') return { x: '100%', opacity: 0 };
      if (type === 'push_back') return { x: '-100%', opacity: 0 };
      if (type === 'slide_up') return { y: '100%', opacity: 0 };
      return { opacity: 1 };
    },
    animate: {
      x: 0,
      y: 0,
      opacity: 1,
      transition: {
        x: { type: 'spring', stiffness: 220, damping: 25 },
        y: { type: 'spring', stiffness: 180, damping: 22 },
        opacity: { duration: 0.2 },
      },
    },
    exit: (type: typeof transitionDirection) => {
      if (type === 'push') return { x: '-100%', opacity: 0 };
      if (type === 'push_back') return { x: '100%', opacity: 0 };
      if (type === 'slide_up') return { y: '100%', opacity: 0 };
      return { opacity: 0 };
    },
  };

  // Master router switch block
  const renderScreen = () => {
    switch (screen) {
      case 'PORTFOLIO_DASHBOARD':
        return <Dashboard assets={assets} settings={settings} onNavigate={navigate} />;
      case 'SWAP_INTERFACE':
        return (
          <Swap 
            assets={assets} 
            settings={settings} 
            onNavigate={navigate} 
            onPrepareSwap={handlePrepareSwap} 
          />
        );
      case 'STAKING_INTERFACE':
        return <Staking settings={settings} onNavigate={navigate} />;
      case 'WALLET_INTERFACE':
        return <Wallet settings={settings} onNavigate={navigate} />;
      case 'DEPOSIT_INTERFACE':
        return <Deposit assets={assets} settings={settings} onNavigate={navigate} />;
      case 'WITHDRAW_INTERFACE':
        return <Withdraw assets={assets} settings={settings} onNavigate={navigate} />;
      case 'TRANSACTION_SIMULATION':
        return (
          <Simulate 
            settings={settings} 
            onNavigate={navigate} 
            preparedSwap={preparedSwap}
            onConfirmSwap={handleConfirmSwapExec}
          />
        );
      case 'SETTINGS_INTERFACE':
        return (
          <Settings 
            settings={settings} 
            onNavigate={navigate} 
            onUpdateSettings={handleUpdateSettings} 
          />
        );
      case 'ACTIVITY_HISTORY':
        return <ActivityHistory activities={activities} settings={settings} onNavigate={navigate} />;
      case 'SCAM_WARNING_MODAL':
        return (
          <ScamWarning 
            preparedSwap={preparedSwap} 
            onNavigate={navigate} 
            onConfirmSwap={handleConfirmSwapExec} 
          />
        );
      default:
        return <Dashboard assets={assets} settings={settings} onNavigate={navigate} />;
    }
  };

  // Wrap navigation so any sidebar/menu interaction also closes the mobile drawer
  const navigateAndCloseNav = (toScreen: Screen, direction: 'push' | 'push_back' | 'slide_up' | 'none') => {
    setMobileNavOpen(false);
    navigate(toScreen, direction);
  };

  // Main system wrapper layout is a flex row (Sidebar + Active Screen).
  // On screens below `lg` the sidebar collapses into an off-canvas drawer.
  return (
    <div className="flex w-screen h-screen bg-[#06132a] text-[#d8e2ff] overflow-hidden leading-normal font-sans antialiased selection:bg-[#2E7DFF]/30 selection:text-white">

      {/* 1. Sidebar Menu — static on desktop, slide-in drawer on mobile (hidden on isolated overlays) */}
      {screen !== 'SCAM_WARNING_MODAL' && (
        <Sidebar
          currentScreen={screen}
          onNavigate={navigateAndCloseNav}
          settings={settings}
          mobileOpen={mobileNavOpen}
          onCloseMobile={() => setMobileNavOpen(false)}
        />
      )}

      {/* 2. Content column: mobile top bar + active render view */}
      <div className="flex-1 min-w-0 h-full flex flex-col">

        {/* Mobile-only top bar with brand + hamburger trigger */}
        {screen !== 'SCAM_WARNING_MODAL' && (
          <header className="lg:hidden flex items-center justify-between gap-3 h-16 px-4 shrink-0 border-b border-slate-800 bg-[#06132a]/95 backdrop-blur z-20">
            <BanaLogo size="sm" />
            <button
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="p-2.5 rounded-xl border border-slate-700 bg-slate-800/50 text-slate-200 hover:bg-slate-700 active:scale-95 transition-all cursor-pointer"
            >
              <Menu className="h-5 w-5" />
            </button>
          </header>
        )}

        {/* Main Active Render View (Framed with gorgeous, fluid, hardware-level transition mechanics) */}
        <main className="flex-1 min-w-0 relative overflow-hidden bg-[#06132a]">
          <AnimatePresence initial={false} mode="wait" custom={transitionDirection}>
            <motion.div
              key={screen}
              custom={transitionDirection}
              variants={variants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full h-full absolute inset-0 flex flex-col"
            >
              {renderScreen()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

    </div>
  );
}
