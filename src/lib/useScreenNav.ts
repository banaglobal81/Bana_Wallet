'use client';

import { useRouter } from 'next/navigation';
import type { Screen } from '@/types';

// Map every routable Screen value to its Next.js App Router path.
export const SCREEN_TO_PATH: Partial<Record<Screen, string>> = {
  PORTFOLIO_DASHBOARD: '/portfolio',
  SWAP_INTERFACE: '/swap',
  STAKING_INTERFACE: '/staking',
  WALLET_INTERFACE: '/wallet',
  DEPOSIT_INTERFACE: '/deposit',
  WITHDRAW_INTERFACE: '/withdraw',
  SETTINGS_INTERFACE: '/settings',
  ACTIVITY_HISTORY: '/activity',
  // TRANSACTION_SIMULATION and SCAM_WARNING_MODAL are NOT routes — they are
  // modal/local state inside the swap page.  They are handled via overrides.
};

/**
 * Returns a `navigate(screen, direction?)` function that:
 *  - Calls the override handler if one is provided for the given screen, or
 *  - Pushes to the corresponding App Router path.
 *
 * The `direction` argument is accepted to keep the same call-site signature as
 * the old SPA navigate() and is otherwise ignored (transitions are uniform).
 */
export function useScreenNav(
  overrides?: Partial<Record<Screen, () => void>>,
): (screen: Screen, direction?: string) => void {
  const router = useRouter();

  return (screen: Screen, _direction?: string) => {
    const override = overrides?.[screen];
    if (override) {
      override();
      return;
    }
    const path = SCREEN_TO_PATH[screen];
    if (path) {
      router.push(path);
    }
  };
}
