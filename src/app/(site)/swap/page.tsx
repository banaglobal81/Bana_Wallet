'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/app/providers';
import { useScreenNav } from '@/lib/useScreenNav';
import Swap from '@/components/Swap';
import Simulate from '@/components/Simulate';
import ScamWarning from '@/components/ScamWarning';
import type { Screen } from '@/types';

type Step = 'form' | 'simulate' | 'scam';

export default function SwapPage() {
  const { assets, settings, preparedSwap, prepareSwap, confirmSwapExec } = useApp();
  const [step, setStep] = useState<Step>('form');
  const router = useRouter();

  // Nav adapter for the Swap form — intercepts modal screens, routes the rest.
  const swapNavAdapter = useScreenNav({
    TRANSACTION_SIMULATION: () => setStep('simulate'),
    SCAM_WARNING_MODAL: () => setStep('scam'),
  });

  // Nav adapter for Simulate: confirm → portfolio, reject → back to form.
  const simulateNavAdapter = (screen: Screen, _direction?: string) => {
    if (screen === 'SWAP_INTERFACE') { setStep('form'); return; }
    if (screen === 'SCAM_WARNING_MODAL') { setStep('scam'); return; }
    // PORTFOLIO_DASHBOARD or ACTIVITY_HISTORY after confirm
    const paths: Partial<Record<Screen, string>> = {
      PORTFOLIO_DASHBOARD: '/portfolio',
      ACTIVITY_HISTORY: '/activity',
    };
    const path = paths[screen];
    if (path) { router.push(path); return; }
    // Fallback: use generic nav
    swapNavAdapter(screen, _direction);
  };

  // Nav adapter for ScamWarning: reject → back to form, confirm → portfolio.
  const scamNavAdapter = (screen: Screen, _direction?: string) => {
    if (screen === 'SWAP_INTERFACE') { setStep('form'); return; }
    const paths: Partial<Record<Screen, string>> = {
      PORTFOLIO_DASHBOARD: '/portfolio',
      ACTIVITY_HISTORY: '/activity',
    };
    const path = paths[screen];
    if (path) { router.push(path); return; }
    swapNavAdapter(screen, _direction);
  };

  if (step === 'simulate') {
    return (
      <Simulate
        settings={settings}
        onNavigate={simulateNavAdapter}
        preparedSwap={preparedSwap}
        onConfirmSwap={confirmSwapExec}
      />
    );
  }

  if (step === 'scam') {
    return (
      <ScamWarning
        preparedSwap={preparedSwap}
        onNavigate={scamNavAdapter}
        onConfirmSwap={confirmSwapExec}
      />
    );
  }

  return (
    <Swap
      assets={assets}
      settings={settings}
      onNavigate={swapNavAdapter}
      onPrepareSwap={prepareSwap}
    />
  );
}
