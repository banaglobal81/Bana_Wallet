'use client';

import { useTranslations } from 'next-intl';
import { Info, X } from 'lucide-react';
import type { StakePosition, StakingProduct } from '../../utils/stakingApi';
import { outcomeFor } from './renewalCopy';

// docs/specs/staking-page-v2-screen-flow-frd.md §4.7 — B5 INLINE NOTICES.
// Only notice #4 (auto-renew outcome, S3) is wired here — it is the only one
// with a real data source right now. #1/#2 (maintenance / worker-paused)
// need server flags that don't exist in the schema yet, and #3 (maturity
// nudge) is PS-B-only (a claim entry point), so none of the three are built
// here — no flag, no dead render path (§11.2).
export default function InlineNotices({
  positions,
  visibleRenewals,
  products,
  onDismiss,
}: {
  /** Full position list — needed so a renewed position's successor (which may
   *  not itself be "visible", e.g. it has no renewal outcome of its own yet)
   *  can still be looked up for the "jump to successor" affordance. */
  positions: StakePosition[];
  visibleRenewals: StakePosition[];
  products: StakingProduct[];
  onDismiss: (ids: string[]) => void;
}) {
  const ar = useTranslations('staking.autoRenew');

  if (visibleRenewals.length === 0) return null;

  return (
    <div data-testid="renewal-notice" className="notice-info rounded-lg p-3 sm:p-4 border text-sm leading-relaxed flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Info className="h-4 w-4 shrink-0" />
          {visibleRenewals.length > 1 && (
            <span data-testid="renewal-notice-count" className="inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full text-[10px] font-bold bg-black/10 border border-current/30">
              {visibleRenewals.length}
            </span>
          )}
        </div>
        <button
          type="button"
          data-testid="renewal-notice-dismiss"
          onClick={() => onDismiss(visibleRenewals.map((p) => p.id))}
          className="hover:opacity-75 cursor-pointer shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-col gap-2 divide-y divide-current/10">
        {visibleRenewals.map((p) => {
          const { heading, body } = outcomeFor(p, positions, products, ar);
          return (
            <div key={p.id} className="pt-2 first:pt-0 flex flex-col gap-0.5">
              <span className="font-bold">{heading}</span>
              <span className="font-mono text-xs leading-relaxed opacity-80">{body}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
