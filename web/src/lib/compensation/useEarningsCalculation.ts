'use client';

// Thin React wrapper over the pure `calc.ts` math. Lives beside the other
// hooks in src/lib (useHubOnline.ts, useScreenNav.ts) — the repo has no
// src/hooks/ directory.
import { useMemo } from 'react';
import type Decimal from 'decimal.js';
import type { BonusBreakdown, PackageId } from '@/types/compensation-plan';
import { calculateBonusBreakdown, calculateTotal, isPackageId } from './calc';
import { PACKAGES } from './plan';

/** What {@link useEarningsCalculation} returns. USD and BANA are never combined. */
export interface EarningsCalculation {
  /** Fast Start USD over the whole period. */
  readonly fastStart: Decimal;
  /** BANA emitted over the whole period. A token quantity, not a dollar amount. */
  readonly emission: Decimal;
  /** USD total: Fast Start + fees. Contains no token value. */
  readonly totalUsd: Decimal;
  /** BANA total. Never add this to `totalUsd`. */
  readonly totalBana: Decimal;
  /** Transaction-fee income. Always zero during network ramp-up. */
  readonly feeEstimate: Decimal;
  /** Mandatory disclosure to render alongside any figure above. */
  readonly disclaimer: string;
  /** The five bonus lines valued against this package's price × quantity. */
  readonly breakdown: BonusBreakdown;
}

/**
 * Memoised compensation figures for a package, quantity, and duration.
 *
 * There is deliberately no combined USD+BANA total: BANA has no official price,
 * so summing the two would assert a token valuation.
 *
 * @param packageId Package id. An unrecognised value falls back to `'orbit'`.
 * @param quantity  Number of packages. Defaults to 1.
 * @param months    Duration in 30-day months. Defaults to 1.
 */
export function useEarningsCalculation(
  packageId: string,
  quantity: number = 1,
  months: number = 1,
): EarningsCalculation {
  return useMemo(() => {
    const id: PackageId = isPackageId(packageId) ? packageId : 'orbit';
    const earnings = calculateTotal(id, quantity, months);
    const volume = PACKAGES[id].price.mul(Math.max(0, quantity));

    return {
      fastStart: earnings.fastStart,
      emission: earnings.emission,
      totalUsd: earnings.totalUsd,
      totalBana: earnings.totalBana,
      feeEstimate: earnings.feeEstimate,
      disclaimer: earnings.disclaimer,
      breakdown: calculateBonusBreakdown(volume),
    };
  }, [packageId, quantity, months]);
}

export default useEarningsCalculation;
