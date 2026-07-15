'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import type { SystemSettings } from '@/types';
import { DEFAULT_SETTINGS } from '@/settingsDefaults';

interface AppState {
  settings: SystemSettings;
  updateSettings: (updater: Partial<SystemSettings>) => void;
}

const Ctx = createContext<AppState | null>(null);

export function Providers({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);

  const updateSettings = useCallback((updater: Partial<SystemSettings>) => {
    setSettings((prev) => ({ ...prev, ...updater }));
  }, []);

  return (
    <Ctx.Provider value={{ settings, updateSettings }}>
      {children}
    </Ctx.Provider>
  );
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used within <Providers>');
  return v;
}
