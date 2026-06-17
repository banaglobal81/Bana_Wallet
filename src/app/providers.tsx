'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Asset, Activity, SystemSettings } from '@/types';
import { INITIAL_ASSETS, INITIAL_ACTIVITIES, DEFAULT_SETTINGS } from '@/mockData';

export type PreparedSwap = {
  fromSymbol: string;
  toSymbol: string;
  fromAmount: string;
  toAmount: string;
  isHighRisk: boolean;
  rate: number;
  gasFee: string;
} | null;

export type Role = 'user' | 'broker';

interface AppState {
  assets: Asset[];
  activities: Activity[];
  settings: SystemSettings;
  preparedSwap: PreparedSwap;
  role: Role;
  setRole: (r: Role) => void;
  updateSettings: (updater: Partial<SystemSettings>) => void;
  prepareSwap: (payload: PreparedSwap) => void;
  confirmSwapExec: () => void;
}

const Ctx = createContext<AppState | null>(null);

const fromAmtStr = (num: number) =>
  num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });

export function Providers({ children }: { children: React.ReactNode }) {
  const [assets, setAssets] = useState<Asset[]>(INITIAL_ASSETS);
  const [activities, setActivities] = useState<Activity[]>(INITIAL_ACTIVITIES);
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [preparedSwap, setPreparedSwap] = useState<PreparedSwap>(null);
  // Always start as 'user' so the server render and the first client render match
  // (avoids hydration mismatch). The saved value is loaded in a useEffect after mount.
  const [role, setRoleState] = useState<Role>('user');

  // After mount: restore persisted role from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('bana_role');
      if (saved === 'broker' || saved === 'user') {
        setRoleState(saved);
      }
    } catch { /* localStorage blocked (private browsing, etc.) — silently ignore */ }
  }, []);

  // Wrapper that both updates state and persists to localStorage
  const setRole = useCallback((r: Role) => {
    setRoleState(r);
    try {
      localStorage.setItem('bana_role', r);
    } catch { /* ignore */ }
  }, []);

  const updateSettings = useCallback((updater: Partial<SystemSettings>) => {
    setSettings((prev) => ({ ...prev, ...updater }));
  }, []);

  const prepareSwap = useCallback((payload: PreparedSwap) => {
    setPreparedSwap(payload);
  }, []);

  // Ported verbatim from the original App.tsx swap flow. Operates on the in-memory
  // mock asset ledger only (no real funds), so the existing parseFloat math is kept
  // to preserve behavior during the migration.
  const confirmSwapExec = useCallback(() => {
    setPreparedSwap((current) => {
      if (!current) return null;
      const { fromSymbol, toSymbol, fromAmount, toAmount, isHighRisk } = current;
      const fromVal = parseFloat(fromAmount) || 0;
      const toVal = parseFloat(toAmount.replace(/,/g, '')) || 0;

      setAssets((prevAssets) =>
        prevAssets.map((asset) => {
          if (asset.symbol === fromSymbol) {
            const nextHoldings = Math.max(0, asset.holdings - fromVal);
            return { ...asset, holdings: nextHoldings, value: nextHoldings * asset.price };
          }
          if (asset.symbol === toSymbol) {
            const nextHoldings = asset.holdings + toVal;
            return { ...asset, holdings: nextHoldings, value: nextHoldings * asset.price };
          }
          return asset;
        }),
      );

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
        gasFee:
          settings.networkGas === 'Standard'
            ? '$4.50'
            : settings.networkGas === 'Fast'
              ? '$12.42'
              : '$25.00',
      };
      setActivities((prev) => [newRecord, ...prev]);
      return null;
    });
  }, [settings.networkGas]);

  return (
    <Ctx.Provider
      value={{
        assets,
        activities,
        settings,
        preparedSwap,
        role,
        setRole,
        updateSettings,
        prepareSwap,
        confirmSwapExec,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used within <Providers>');
  return v;
}
