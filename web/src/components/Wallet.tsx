'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Decimal from 'decimal.js';
import { Screen, SystemSettings } from '../types'; // SystemSettings kept for WalletProps signature
import { getNiaBalance, getNiaMarkets } from '../utils/niaApi';
import { getStakePositions } from '../utils/stakingApi';
import { getManagedCoins } from '../utils/coinsApi';
import { getLocalBalance, type LocalBalanceCoin } from '../utils/localBalanceApi';
import StakedSummaryCard from './staking/StakedSummaryCard';
import LocalBalanceGroup from './wallet/LocalBalanceGroup';
import {
  Wallet as WalletIcon,
  Download,
  Upload,
  ShieldCheck,
  RefreshCw,
  ChevronRight,
  Activity as ActivityIcon,
} from 'lucide-react';

interface WalletProps {
  settings: SystemSettings;
  onNavigate: (toScreen: Screen, direction: 'push' | 'push_back' | 'slide_up' | 'none') => void;
}

interface BalanceRow { walletType: string; currency: string; balance: string; locked?: string }

/**
 * Staked principal, as balance rows — one per coin, summed across the user's
 * positions that still hold funds. Staking never moves funds in the Nia wallet,
 * so this never appears in the hub's response; without it the table reads "no
 * balances" even for a user who has coins staked. Reported as locked (not
 * available), because that is exactly what it is.
 *
 * ACTIVE and MATURED both still hold the principal in this row's own model
 * (no v1-style third 'PAID' status exists any more — rev05 §5.2①/DC-8).
 * Filtering to ACTIVE alone made a matured stake disappear from the balances
 * entirely, which is exactly when the user most wants to see it. In practice
 * this whole row only ever applies to a HUB-authority coin today — every
 * live V2-CORE staking product is BANA, and BANA is LOCAL-authority, so
 * `localAuthorityCoins` below excludes it before this loop ever sums it.
 *
 * `localAuthorityCoins` — A-7 LB-C1: a LOCAL-authority coin's ENTIRE
 * principal picture — both currently-locked (A-3 STAKE_PRINCIPAL_LOCK,
 * surfaced as Group 2's holds) and already-released-at-maturity (V2 has no
 * v1-style "still locked until claimed" limbo: `maturePositionV2` calls
 * `releaseHold` immediately, not a later "paid" step — rev05 §5.2②) — is
 * owned by Group 2 (`LocalBalanceGroup`), never by this legacy synthetic
 * row. The exclusion is therefore by COIN (any coin this user's local-balance
 * response carries a row for at all), not by "does this coin currently have
 * a nonzero hold" — the latter would under-exclude the moment a position
 * matures and its hold releases: the coin's current hold would read `0`
 * (so the older, narrower guard would stop excluding it), yet this function
 * would still sum that MATURED position's principal into a `locked: …` row
 * that is no longer true — the exact same principal is by then already
 * showing, correctly, as `available` in Group 2. Sourced from `localCoins`
 * by coin symbol alone (present even on that coin's own 'error' row) —
 * see the call site's own comment for why load success/failure must not
 * change which coins this excludes.
 */
function stakedRows(
  positions: { coin: string; principal: string; status: string }[],
  localAuthorityCoins: Set<string>,
): BalanceRow[] {
  const byCoin = new Map<string, Decimal>();
  for (const p of positions) {
    if (localAuthorityCoins.has(p.coin.toUpperCase())) continue;
    byCoin.set(p.coin, (byCoin.get(p.coin) ?? new Decimal(0)).plus(p.principal || '0'));
  }
  return [...byCoin.entries()]
    .filter(([, total]) => total.gt(0))
    .map(([currency, total]) => ({
      walletType: 'staking',
      currency,
      balance: '0',
      locked: total.toFixed(),
    }));
}

/**
 * Every coin the tenant supports — the hub's markets plus admin-added custom
 * coins (BANA lives there). Used to pad the table with real zero rows, so a coin
 * you can deposit is visible before you hold any of it.
 *
 * `excludeLocalAuthority` — A-7 LB-C3: a LOCAL-authority coin (BANA) is shown
 * in Group 2 (LocalBalanceGroup) instead, including its own zero/empty state
 * (LB-9). Padding it into this HUB-authority zero-row list too would put the
 * same coin in both groups, which reads as an X-1′ violation even though it
 * is "only" a display bug.
 */
function supportedSymbols(
  markets: { currencies?: { symbol?: string }[] } | null,
  managed: { symbol: string }[],
  excludeLocalAuthority: Set<string>,
): string[] {
  const out = new Set<string>();
  for (const c of markets?.currencies ?? []) {
    if (c?.symbol) out.add(c.symbol.toUpperCase());
  }
  for (const m of managed) {
    if (m?.symbol) out.add(m.symbol.toUpperCase());
  }
  for (const s of excludeLocalAuthority) out.delete(s);
  return [...out];
}

/** Zero rows for supported coins the user holds none of, so the list is complete. */
function zeroRows(held: BalanceRow[], symbols: string[]): BalanceRow[] {
  const present = new Set(held.map((r) => (r.currency ?? '').toUpperCase()));
  return symbols
    .filter((s) => !present.has(s))
    .sort()
    .map((currency) => ({ walletType: '', currency, balance: '0', locked: '0' }));
}

export default function Wallet({ onNavigate }: WalletProps) {
  const t = useTranslations('walletPage');
  // User-side balances only — broker/settlement panel lives at /admin/settlement
  // `rows` = coins the user actually holds or has staked. `allZeroRows` = the
  // rest of the supported catalogue, shown only when the user asks for it —
  // a wall of zeros buries the balances that matter.
  const [rows, setRows] = useState<BalanceRow[]>([]);
  const [allZeroRows, setAllZeroRows] = useState<BalanceRow[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [balState, setBalState] = useState<'loading' | 'ok' | 'error'>('loading');
  // The server's own reason for a failure (e.g. "not provisioned for wallet
  // access"). Shown verbatim — a generic "backend unreachable" would misdiagnose
  // an auth/provisioning problem as an outage and send people chasing the wrong bug.
  const [balError, setBalError] = useState<string | null>(null);

  // Group 2 (LOCAL-authority / "platform-issued assets") — A-7 §3. A fully
  // independent load: its own loading/ok/error state (LB-6), never shares
  // balState with the HUB table above. A failure here must never hide the
  // HUB balances, and a HUB failure must never hide this block.
  const [localState, setLocalState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [localCoins, setLocalCoins] = useState<LocalBalanceCoin[]>([]);

  const loadLocal = async () => {
    setLocalState('loading');
    try {
      const coins = await getLocalBalance();
      setLocalCoins(coins);
      setLocalState('ok');
    } catch {
      setLocalCoins([]);
      setLocalState('error');
    }
  };

  const loadUser = async () => {
    setBalState('loading');
    setBalError(null);
    try {
      // Staking (local ledger) and the coin catalogue are fetched alongside the
      // hub balances. Only getNiaBalance() may fail the panel — the others just
      // enrich it, so they degrade to empty rather than hiding real balances.
      const [data, positions, markets, managed] = await Promise.all([
        getNiaBalance(),
        getStakePositions().catch(() => []),
        getNiaMarkets().catch(() => null),
        getManagedCoins().catch(() => []),
      ]);
      // LB-C1/LB-C3 — every coin the local-balance response carries a row
      // for at all is LOCAL-authority (that route already scopes to
      // balanceAuthority=LOCAL, visible=true) REGARDLESS of whether that
      // particular row's own balance fetch succeeded — `coin` is set on the
      // 'error' shape too (`{ coin, state: 'error' }`), only `balance`/
      // `available`/`holds` are missing. This ONE set is reused for both
      // guards below: LB-C1 (stakedRows' legacy synthetic "locked" row must
      // never re-show a LOCAL coin's principal — active or already
      // matured/released, see stakedRows' own doc comment) and LB-C3 (the
      // HUB zero-catalogue must never pad in a coin Group 2 already owns —
      // including one Group 2 currently shows in its own error state; that
      // failure must never be papered over by a second, HUB-shaped row for
      // the same coin appearing elsewhere on the page).
      const localAuthoritySymbols = new Set(localCoins.map((c) => c.coin.toUpperCase()));
      const held: BalanceRow[] = [
        ...(Array.isArray(data?.wallets) ? data.wallets : []),
        ...(Array.isArray(data?.tradingBalances) ? data.tradingBalances : []),
        ...(Array.isArray(data) ? data : []),
        ...stakedRows(positions, localAuthoritySymbols),
        // INSURANCE is an internal Nia-Hub wallet, never shown to users.
      ].filter((r) => (r.walletType ?? '').toUpperCase() !== 'INSURANCE');
      setRows(held);
      // Kept separate from `rows` so the toggle never re-fetches: the catalogue
      // is only *displayed* on demand, not loaded on demand.
      setAllZeroRows(zeroRows(held, supportedSymbols(markets, managed, localAuthoritySymbols)));
      setBalState('ok');
    } catch (e) {
      setBalError((e as Error)?.message?.trim() || null);
      setBalState('error');
    }
  };

  useEffect(() => { loadLocal(); }, []);
  // Re-derive HUB rows once localCoins resolves, so the LB-C1/LB-C3 guards use
  // real data rather than the empty initial state — without making Group 2's
  // load block Group 1's (each effect is independently triggered).
  useEffect(() => { loadUser(); }, [localCoins]); // eslint-disable-line react-hooks/exhaustive-deps

  // Held coins always first; the zero catalogue only when asked for.
  const visibleRows = showAll ? [...rows, ...allZeroRows] : rows;

  return (
    <div className="bana-page flex-1 min-h-full bg-[#06132a] text-[#d8e2ff] p-4 sm:p-6 lg:p-8 flex flex-col gap-6 overflow-y-auto">

      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center pb-2 border-b border-[#1E3559]/40">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <WalletIcon className="h-7 w-7 text-[#528dff]" />
            {t('title')}
          </h1>
          <p className="text-xs sm:text-sm text-[#8c90a0] mt-1 font-mono">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/25 rounded-lg text-emerald-400 font-semibold text-xs font-mono select-none self-start sm:self-auto">
          <ShieldCheck className="h-4 w-4" /> {t('niaSecured')}
        </div>
      </header>

      {/* Deposit / Withdraw */}
      <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => onNavigate('DEPOSIT_INTERFACE', 'slide_up')}
              className="group p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] hover:border-emerald-400/40 transition-all flex items-center justify-between gap-3 cursor-pointer text-left"
            >
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400"><Download className="h-5 w-5" /></div>
                <div>
                  <div className="text-sm font-bold text-white">{t('depositTitle')}</div>
                  <div className="text-xs text-[#8c90a0]">{t('depositSubtitle')}</div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-[#8c90a0] group-hover:translate-x-0.5 transition-transform" />
            </button>
            <button
              onClick={() => onNavigate('WITHDRAW_INTERFACE', 'slide_up')}
              className="group p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] hover:border-[#528dff]/40 transition-all flex items-center justify-between gap-3 cursor-pointer text-left"
            >
              <div className="flex items-center gap-3">
                <div className="p-3 bg-[#528dff]/10 rounded-xl text-[#528dff]"><Upload className="h-5 w-5" /></div>
                <div>
                  <div className="text-sm font-bold text-white">{t('withdrawTitle')}</div>
                  <div className="text-xs text-[#8c90a0]">{t('withdrawSubtitle')}</div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-[#8c90a0] group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          {/* Staked coin + recorded yield, server-sourced only (only shows if the user has a stake) */}
          <StakedSummaryCard onOpen={() => onNavigate('STAKING_INTERFACE', 'push')} />

          {/* Balances */}
          <div className="p-6 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-sans font-extrabold text-[#d8e2ff] text-sm uppercase tracking-wider">{t('balances')}</h3>
              <div className="flex items-center gap-2">
                {balState === 'ok' && allZeroRows.length > 0 && (
                  <button
                    onClick={() => setShowAll((v) => !v)}
                    aria-pressed={showAll}
                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-mono font-bold cursor-pointer transition-colors ${
                      showAll
                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                        : 'border-[#1E3559] bg-[#020d24]/60 text-[#8c90a0] hover:text-white'
                    }`}
                  >
                    {t('showAllCoins')}
                  </button>
                )}
                <button onClick={() => { loadUser(); loadLocal(); }} aria-label={t('refreshBalancesAria')} className="p-2 bg-[#020d24]/60 hover:bg-[#1e3459] border border-[#1E3559] rounded-lg text-[#8c90a0] hover:text-white transition-colors cursor-pointer">
                  <RefreshCw className={`h-4 w-4 ${balState === 'loading' || localState === 'loading' ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
            {balState === 'loading' ? (
              <p className="text-xs font-mono text-[#8c90a0] py-6 text-center">{t('loadingBalances')}</p>
            ) : balState === 'error' ? (
              <p className="text-xs font-mono text-rose-300 py-6 text-center">{balError ?? t('backendUnreachable')}</p>
            ) : visibleRows.length === 0 ? (
              <div className="py-8 text-center flex flex-col items-center gap-3">
                <div className="p-3 bg-[#020d24]/60 rounded-full border border-[#1E3559]"><WalletIcon className="h-6 w-6 text-[#8c90a0]" /></div>
                <p className="text-sm font-bold text-white">{t('noBalances')}</p>
                <p className="text-xs text-[#8c90a0] max-w-xs">{t('noBalancesBody')}</p>
                <button
                  onClick={() => onNavigate('DEPOSIT_INTERFACE', 'slide_up')}
                  className="mt-1 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-bold transition-colors cursor-pointer"
                >
                  <Download className="h-4 w-4" /> {t('depositNow')}
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-2 px-2">
                <table className="w-full min-w-[420px] text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#1E3559]/60 text-[11px] font-mono text-[#8c90a0] uppercase tracking-wider">
                      <th className="pb-3 font-semibold">{t('tableWallet')}</th>
                      <th className="pb-3 font-semibold">{t('tableAsset')}</th>
                      <th className="pb-3 text-right font-semibold">{t('tableAvailable')}</th>
                      <th className="pb-3 text-right font-semibold">{t('tableLocked')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E3559]/40">
                    {visibleRows.map((r, i) => (
                      <tr key={i} className="hover:bg-[#020d24]/40 transition-colors">
                        <td className="py-3.5 font-mono text-xs text-[#afc6ff]">{r.walletType || t('depositWallet')}</td>
                        <td className="py-3.5 font-sans text-sm font-bold text-white">{r.currency}</td>
                        <td className="py-3.5 text-right font-mono text-sm text-white">{r.balance}</td>
                        <td className="py-3.5 text-right font-mono text-xs text-[#8c90a0]">{r.locked ?? '0'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Group 2 — LOCAL-authority ("platform-issued") balances. A deliberately
              separate card from the HUB balances table above: its own
              loading/error/empty states, and no total combining the two (A-7 LA-1). */}
          <LocalBalanceGroup state={localState} coins={localCoins} onNavigate={onNavigate} />

          {/* Activity shortcut */}
          <button
            onClick={() => onNavigate('ACTIVITY_HISTORY', 'push')}
            className="p-4 rounded-2xl bg-[#112643]/50 border border-[#1E3559] hover:border-[#528dff]/40 transition-colors flex items-center justify-between gap-3 cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-[#528dff]/10 rounded-xl text-[#528dff]"><ActivityIcon className="h-5 w-5" /></div>
              <div className="text-left">
                <div className="text-sm font-bold text-white">{t('transactionHistory')}</div>
                <div className="text-xs text-[#8c90a0]">{t('transactionHistorySubtitle')}</div>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-[#8c90a0] group-hover:translate-x-0.5 transition-transform" />
          </button>
      </>
    </div>
  );
}
