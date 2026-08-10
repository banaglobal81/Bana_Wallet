'use client';

import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';
import CoinAvatar from './CoinAvatar';
import type { LocalBalanceCoin } from '../../utils/localBalanceApi';
import { Screen } from '../../types';

// docs/specs/staking-yield-system-v2-design-a7-screen-flow-frd.md §3.3 (「그룹 2」) +
// docs/specs/staking-yield-system-v2-design-a11-visual-tokens.md §1 — the
// "Platform-issued assets" block. Deliberately a SEPARATE card from the hub
// balances table above it, with its own loading/error/empty states (LB-6/LB-7)
// and NO combined total anywhere (LA-1 / AC-A7-01).

export default function LocalBalanceGroup({
  state,
  coins,
  onNavigate,
}: {
  state: 'loading' | 'ok' | 'error';
  coins: LocalBalanceCoin[];
  onNavigate: (toScreen: Screen, direction: 'push' | 'push_back' | 'slide_up' | 'none') => void;
}) {
  const t = useTranslations('walletPage');

  return (
    <div className="p-6 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-4">
      <div>
        <h3 className="font-sans font-extrabold text-[#d8e2ff] text-sm uppercase tracking-wider">{t('groupPlatform')}</h3>
      </div>

      {state === 'loading' ? (
        <p data-testid="local-balance-loading" className="text-xs font-mono text-[#8c90a0] py-4 text-center">{t('localLoading')}</p>
      ) : state === 'error' ? (
        <p data-testid="local-balance-error" className="text-xs font-mono text-rose-300 py-4 text-center">{t('localLoadFailed')}</p>
      ) : coins.length === 0 ? (
        <p data-testid="local-balance-empty" className="text-xs font-mono text-[#8c90a0] py-4 text-center">{t('localEmpty')}</p>
      ) : (
        <div className="flex flex-col gap-5">
          {coins.map((c) => (
            <LocalBalanceRow key={c.coin} coin={c} onNavigate={onNavigate} />
          ))}
        </div>
      )}

      <p className="text-xs text-[#8c90a0] leading-relaxed">{t('groupPlatformHelp')}</p>
    </div>
  );
}

function LocalBalanceRow({
  coin,
  onNavigate,
}: {
  coin: LocalBalanceCoin;
  onNavigate: (toScreen: Screen, direction: 'push' | 'push_back' | 'slide_up' | 'none') => void;
}) {
  const t = useTranslations('walletPage');

  if (coin.state === 'error') {
    return (
      <div className="flex items-center gap-2.5" data-testid={`local-balance-row-error-${coin.coin}`}>
        <CoinAvatar symbol={coin.coin} size={20} />
        <span className="text-sm font-bold text-white">{coin.coin}</span>
        <span className="text-xs text-rose-300 font-mono">{t('localLoadFailed')}</span>
      </div>
    );
  }

  const withdrawalPending = coin.holds?.withdrawalPending ?? '0';
  const hasWithdrawalHold = withdrawalPending !== '0' && !/^0(\.0+)?$/.test(withdrawalPending);
  const other = coin.holds?.other ?? '0';
  const hasOtherHold = other !== '0' && !/^0(\.0+)?$/.test(other);

  return (
    <div className="flex flex-col gap-3" data-testid={`local-balance-row-${coin.coin}`}>
      <div className="flex items-center gap-2">
        <CoinAvatar symbol={coin.coin} size={20} />
        <span className="text-sm font-bold text-white">{coin.coin}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <ValueBox label={t('localBalanceLabel')} value={coin.balance ?? '0'} testId="local-balance-value" />
        <ValueBox label={t('localAvailableLabel')} value={coin.available ?? '0'} testId="local-available-value" />
        <ValueBox label={t('localHoldStake')} value={coin.holds?.stakePrincipal ?? '0'} testId="local-hold-stake" />
        <ValueBox
          label={t('localHoldWithdrawal')}
          value={withdrawalPending}
          testId="local-hold-withdrawal"
          link={
            hasWithdrawalHold
              ? { label: t('localHoldWithdrawalLink'), onClick: () => onNavigate('ACTIVITY_HISTORY', 'push') }
              : undefined
          }
        />
      </div>

      {hasOtherHold && (
        <ValueBox label={t('localHoldOther')} value={other} testId="local-hold-other" />
      )}
    </div>
  );
}

function ValueBox({
  label,
  value,
  testId,
  link,
}: {
  label: string;
  value: string;
  testId: string;
  link?: { label: string; onClick: () => void };
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-[#8c90a0] uppercase tracking-wide">{label}</div>
      {/* Server decimal string, rendered as-is — no locale/precision reformatting (LB-5). */}
      <div data-testid={testId} className="text-sm sm:text-base font-mono text-white break-all">{value}</div>
      {link && (
        <button
          type="button"
          onClick={link.onClick}
          className="inline-flex items-center gap-0.5 text-[11px] font-bold text-[#2E7DFF] hover:text-white cursor-pointer"
        >
          {link.label} <ChevronRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
