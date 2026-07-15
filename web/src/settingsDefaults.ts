import type { SystemSettings } from './types';

// Client-side display preferences. These are NOT wallet/custody settings — real
// balances, trades and transfers all come from Nia-Hub via /api/nia/*.
export const DEFAULT_SETTINGS: SystemSettings = {
  activeChain: 'Mainnet',
};
