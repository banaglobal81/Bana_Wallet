'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCw, CheckCircle2, Loader2 } from 'lucide-react';

// docs/specs/staking-yield-system-v2-design-a7-screen-flow-frd.md §4 (CLM) +
// docs/specs/staking-yield-system-v2-design-a11-visual-tokens.md §2 — the full
// claim-slot state machine: UNAVAILABLE (status chip) / DISABLED / ENABLED
// (button) / in-flight / and the ambiguous-result "state refresh" recovery
// (CLM-4~CLM-10), built now so it is ready the day `yieldRail` flips to
// CLAIM_LIVE and a real claim route exists.
//
// DORMANT BY DESIGN (per the task that added this file): every current caller
// passes `state="UNAVAILABLE"` and no `onClaim` — there is no
// POST /api/staking/claim route in this codebase yet, and Q-M3 (company
// wallet reserves) is unanswered, so PoR-1″ would return NO_RESERVE_BASIS and
// block any credit regardless (rev04 §1.7 PoR-G1). This mirrors how
// localLedger.ts/coinAuthority.ts ship reachable-but-uncalled (see those
// files' own header comments) — the state machine below is real, tested code,
// simply never invoked past UNAVAILABLE today.
//
// CLM-7 (critical, do not "simplify" away): the ambiguous-result recovery
// action is [Reload status], never [Retry]. Retry re-sends a mutating
// request; reload only re-reads server state that a real DB transaction
// already committed or didn't (A-7 §4.4 — "(C) has no partial success").

export type ClaimSlotState = 'UNAVAILABLE' | 'DISABLED' | 'ENABLED';

export type ClaimOutcome =
  | { kind: 'success'; amount: string }
  | { kind: 'error'; messageKey: string }
  | { kind: 'unknown' }; // network/timeout — CLM-4/CLM-7/CLM-9, never "failed"

export interface ClaimSlotProps {
  coin: string;
  state: ClaimSlotState;
  claimableAmount: string;
  /** Only ever supplied once yieldRail = CLAIM_LIVE (see file header). */
  onClaim?: () => Promise<ClaimOutcome>;
  /** Re-reads server state after an ambiguous result — never resubmits (CLM-7). */
  onRefreshStatus?: () => Promise<void>;
  onClaimed?: (amount: string) => void;
}

type Phase = 'idle' | 'confirm' | 'in-flight' | 'unknown' | 'refreshing' | 'success';

export default function ClaimSlot({ coin, state, claimableAmount, onClaim, onRefreshStatus, onClaimed }: ClaimSlotProps) {
  const t = useTranslations('staking');
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [successAmount, setSuccessAmount] = useState<string | null>(null);

  if (state === 'UNAVAILABLE') {
    return (
      <div data-testid="claim-slot-unavailable" className="state-chip-unavailable inline-flex items-center px-3 py-2 rounded-lg">
        <span className="text-sm font-medium">{t('claim.unavailable')}</span>
      </div>
    );
  }

  const handleConfirm = async () => {
    if (!onClaim) return;
    setErrorKey(null);
    setPhase('in-flight');
    try {
      const outcome = await onClaim();
      if (outcome.kind === 'success') {
        setSuccessAmount(outcome.amount);
        setPhase('success');
        onClaimed?.(outcome.amount);
      } else if (outcome.kind === 'error') {
        setErrorKey(outcome.messageKey);
        setPhase('idle'); // slot reverts — a named error is not ambiguous (CLM-4)
      } else {
        setPhase('unknown'); // CLM-4/CLM-7/CLM-9 — timeout/network only, never "failed"
      }
    } catch {
      setPhase('unknown');
    }
  };

  const handleRefresh = async () => {
    if (!onRefreshStatus) return;
    setPhase('refreshing');
    try {
      await onRefreshStatus();
    } finally {
      // The caller re-reads server truth (claimableAmount/claimed) and
      // re-renders; this component only resets its own local phase (CLM-8 —
      // no client-side optimistic state survives a refresh).
      setPhase('idle');
    }
  };

  if (phase === 'unknown' || phase === 'refreshing') {
    return (
      <div data-testid="claim-slot-unknown" className="rounded-lg border border-[#1E3559]/60 bg-[#1E3559]/40 p-3 space-y-2">
        <p className="text-sm text-[#8c90a0]">{t('claim.resultUnknownRefresh')}</p>
        <button
          type="button"
          data-testid="claim-refresh-status"
          onClick={handleRefresh}
          disabled={phase === 'refreshing'}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#2E7DFF] hover:text-white disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
        >
          {phase === 'refreshing' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {t('claim.refreshStatus')}
        </button>
      </div>
    );
  }

  if (phase === 'success' && successAmount != null) {
    // LA-8 — information-level, one line. No particles/sound/count-up/badges.
    return (
      <div data-testid="claim-slot-success" className="text-sm text-white flex items-center gap-1.5">
        <CheckCircle2 className="h-4 w-4 text-[#10b981]" />
        {t('claim.succeeded', { amount: successAmount, coin })}
      </div>
    );
  }

  if (phase === 'confirm') {
    return (
      <div data-testid="claim-slot-confirm" className="rounded-lg border border-[#1E3559]/60 bg-[#1E3559]/40 p-3 space-y-2.5">
        <p className="text-sm text-white">{t('claim.confirmBody', { amount: claimableAmount, coin })}</p>
        <p className="text-xs text-[#8c90a0]">{t('claim.confirmNote2')}</p>
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="claim-confirm-action"
            onClick={handleConfirm}
            className="px-3 py-2 rounded-lg bg-[#2E7DFF] text-white text-sm font-semibold cursor-pointer"
          >
            {t('claim.confirmAction')}
          </button>
          <button
            type="button"
            onClick={() => setPhase('idle')}
            className="px-3 py-2 rounded-lg border border-[#1E3559] text-[#8c90a0] text-sm font-semibold cursor-pointer"
          >
            {t('claim.cancel')}
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'in-flight') {
    return (
      <button
        type="button"
        disabled
        data-testid="claim-slot-inflight"
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#2E7DFF]/60 text-white text-sm font-semibold cursor-not-allowed"
      >
        <Loader2 className="h-4 w-4 animate-spin" /> {t('claim.confirmAction')}
      </button>
    );
  }

  // idle — DISABLED (state prop) or the amount is 0.
  const enabled = state === 'ENABLED' && claimableAmount !== '0' && !/^0(\.0+)?$/.test(claimableAmount);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        data-testid={enabled ? 'claim-slot-enabled' : 'claim-slot-disabled'}
        disabled={!enabled}
        onClick={() => setPhase('confirm')}
        className={
          enabled
            ? 'px-3 py-2 rounded-lg bg-[#2E7DFF]/90 hover:bg-[#2E7DFF] border border-[#2E7DFF] text-sm font-semibold text-white cursor-pointer transition-colors'
            : 'px-3 py-2 rounded-lg bg-[#1E3559]/30 border border-[#1E3559]/50 text-sm font-semibold text-[#8c90a0] cursor-not-allowed opacity-50'
        }
      >
        {t('claim.confirmAction')}
      </button>
      {errorKey && <p className="text-xs text-rose-400">{t(`error.${errorKey}` as never)}</p>}
      {enabled && <p className="text-xs text-[#8c90a0]/70 leading-tight">{t('claim.destinationNote')}</p>}
    </div>
  );
}
