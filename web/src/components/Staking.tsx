'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { useTranslations } from 'next-intl';
import { Screen, SystemSettings } from '../types';
import { Coins, Loader2 } from 'lucide-react';
import {
  getStakingProducts, getStakePositionsAndGame, getStakingRewards, stake,
  type StakingProduct, type StakePosition, type StakingRewards, type DeepCoreGameState,
} from '../utils/stakingApi';
import { getLocalBalance, type LocalBalanceCoin } from '../utils/localBalanceApi';
import DeepCoreEmbed, { DeepCoreControlBar, deriveDeepCoreCrewState, useDeepCoreHidden } from './staking/deep-core/DeepCoreEmbed';
import YieldPanel, { type YieldPanelRow } from './staking/YieldPanel';
import VaultControlBar from './staking/VaultControlBar';
import InlineNotices from './staking/InlineNotices';
import StakeSheet from './staking/sheets/StakeSheet';
import PositionsSheet from './staking/sheets/PositionsSheet';
import YieldSheet from './staking/sheets/YieldSheet';
import { deriveStakeEntryState } from './staking/stakeEntryState';
import { FOURTEEN_DAYS_MS, isRenewalNoticeDismissed, dismissRenewalNotices } from './staking/renewalCopy';

// docs/specs/staking-page-v2-screen-flow-frd.md — the DEEP CORE-centric
// staking page. Real-money state/status/notices render inline on the page
// (B2 YIELD PANEL, B5 INLINE NOTICES); anything the user opens with intent
// (product list, amount entry, position list, yield log) lives in a sheet
// (S-STAKE / S-POS / S-YIELD) — L-1.
//
// PS-A ONLY (docs/patterns/staking-v2-implementation-guide.md hand-off,
// §11.2 of the FRD): the v2 claim rail is not approved/built yet. No claim
// button, no band meter, no bonus breakdown, no new contract disclosure —
// those are PS-B/PS-C render paths this file deliberately does not build.

interface StakingProps {
  settings: SystemSettings;
  onNavigate: (toScreen: Screen, direction: 'push' | 'push_back' | 'slide_up' | 'none') => void;
}

// docs/specs/staking-yield-system-v2-design-t8-stake-flow-frd.md §7.1 R-D5 /
// §7.2 — map the stake route's stable error `code` to a localized
// `staking.error.<code>` string. Unknown/absent codes fall back to
// `error.GENERIC`; the raw server-English message is never shown to the user
// (PS-A T-7 / AC-A7-19).
//
// S-5/ER-1 — the four internal reasons `assertExecutionAllowed` can throw for
// (T2_HALTED, T1_WARNING_NO_OVERRIDE, DIRECT_CHANGE_IN_PROGRESS,
// TRANSITION_IN_PROGRESS — coinAuthority.ts:158-203) are surfaced by
// api/staking/stake/route.ts as FOUR DISTINCT codes (STAKE_COIN_HALTED /
// STAKE_COIN_T1_WARNING / STAKE_COIN_AUTHORITY_CHANGE_IN_PROGRESS /
// STAKE_COIN_AUTHORITY_TRANSITION_IN_PROGRESS — confirmed by reading that
// route directly, not assumed from the FRD's own §7.1 table, which only
// names two of the four). All four must render the SAME user string
// (`error.STAKE_COIN_HALTED`) — the user has no reason to tell them apart,
// and showing four different sentences would leak internal operating state.
const STAKE_ERROR_CODE_TO_KEY: Record<string, 'error.STAKE_COIN_HALTED' | undefined> = {
  STAKE_COIN_HALTED: 'error.STAKE_COIN_HALTED',
  STAKE_COIN_T1_WARNING: 'error.STAKE_COIN_HALTED',
  STAKE_COIN_AUTHORITY_CHANGE_IN_PROGRESS: 'error.STAKE_COIN_HALTED',
  STAKE_COIN_AUTHORITY_TRANSITION_IN_PROGRESS: 'error.STAKE_COIN_HALTED',
};
const KNOWN_STAKE_ERROR_CODES = new Set([
  'STAKE_PATH_MIGRATING', 'STAKE_INVALID_AMOUNT', 'STAKE_PRODUCT_NOT_FOUND', 'STAKE_PRODUCT_CLOSED',
  'STAKE_PRODUCT_FULL', 'STAKE_BELOW_MIN', 'STAKE_ABOVE_MAX', 'STAKE_INSUFFICIENT_LOCAL_BALANCE',
  'STAKE_INSUFFICIENT_AVAILABLE', 'UNAUTHENTICATED',
  // Note: 'AUTO_RENEW_UNAVAILABLE' is deliberately absent — ER-7 requires the
  // 409 a stray `autoRenew` key in the request body draws to fall through to
  // `GENERIC`, not get its own sentence (a dedicated string would have to
  // reuse renewal vocabulary the user should never see on this screen, for
  // an input shape only a stale/tampered client could ever produce).
]);
function localizeStakeError(err: Error & { code?: string; params?: Record<string, string> }, t: ReturnType<typeof useTranslations>): string {
  const mapped = err.code ? STAKE_ERROR_CODE_TO_KEY[err.code] : undefined;
  if (mapped) return t(mapped, err.params);
  const code = err.code && KNOWN_STAKE_ERROR_CODES.has(err.code) ? err.code : 'GENERIC';
  return t(`error.${code}` as 'error.GENERIC', err.params);
}

type SheetId = 'stake' | 'positions' | 'yield' | null;

export default function Staking({ onNavigate: _onNavigate }: StakingProps) {
  const t = useTranslations('staking');

  const [products, setProducts] = useState<StakingProduct[]>([]);
  const [positions, setPositions] = useState<StakePosition[]>([]);
  // SB-1/SB-2/DC-4 — LOCAL-authority balance display, from BANA's own local
  // ledger (`/api/wallet/local-balance`), never the hub. `available` is
  // rendered/compared exactly as the server gives it (LB-2/LB-5) — holds are
  // already netted out server-side, so this screen never subtracts a
  // client-summed locked-principal figure from a hub balance again (that was
  // the old bug: BANA is never listed in the hub's markets, so the previous
  // `balances.get('BANA')` was always 0 regardless of the user's real stake).
  const [localCoins, setLocalCoins] = useState<LocalBalanceCoin[]>([]);
  const [rewards, setRewards] = useState<StakingRewards | null>(null);
  const [gameState, setGameState] = useState<DeepCoreGameState | null>(null);
  // §4.2.2 ③ / R-D2 — server-computed, single source of truth. Never
  // recomputed client-side (that was the bug: the old `lockedByCoin` here
  // summed ACTIVE positions itself and could drift from the withdrawal
  // route's own lock calculation).
  const [lockedPrincipal, setLockedPrincipal] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const [sheetOpen, setSheetOpen] = useState<SheetId>(null);
  const [focusPositionId, setFocusPositionId] = useState<string | null>(null);
  // UF-5 (position → canvas direction) / CH-2 — set when a position row's
  // well badge is clicked in S-POS; handed straight through to DeepCoreEmbed.
  const [focusWellId, setFocusWellId] = useState<string | null>(null);

  // S3 — bump to force a re-check of localStorage dismissal state.
  const [noticeVersion, setNoticeVersion] = useState(0);

  // Shared "hide DEEP CORE" preference — DeepCoreEmbed (B1) gates its own
  // render on this internally; B4 (DeepCoreControlBar) is mounted here in
  // Staking.tsx directly, so it needs the same gate applied explicitly.
  const hidden = useDeepCoreHidden();

  const load = async () => {
    try {
      // G-7 (docs/specs/deep-core-05-screen-flow-frd.md) — the game surface
      // does not add its own poll; its derived state rides along on this
      // same positions request (getStakePositionsAndGame), not a second one.
      //
      // SB-2/AC-T8-08 — no hub balance call here (`getNiaBalance()`/
      // `/api/nia/wallets` is gone outright, not merely unreached): every
      // live staking product is BANA, and BANA is always LOCAL-authority
      // (N-6), so a hub balance is a number this screen never displays.
      // `getLocalBalance()` degrades to `[]` on failure (never throws into
      // this Promise.all) — a fetch failure surfaces as `BALANCE_UNKNOWN`
      // per-coin via `deriveStakeEntryState`, not as a blank/zero balance.
      const [p, posAndGame, local, rew] = await Promise.all([
        getStakingProducts(), getStakePositionsAndGame(), getLocalBalance().catch(() => []),
        getStakingRewards().catch(() => null),
      ]);
      setProducts(p);
      setPositions(posAndGame.positions);
      setGameState(posAndGame.game);
      setLockedPrincipal(posAndGame.lockedPrincipal);
      setLocalCoins(local);
      setRewards(rew);
    } catch { /* sections show empty state */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // Tick once a second — used only for the maturity countdown *clock* inside
  // S-POS (a time display is allowed, L-4; a money counter is not, R-U7).
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // §4 SB-1 — the LOCAL-authority `available`, rendered exactly as the
  // server gives it. NOT `available − lockedPrincipal` — the server already
  // netted the STAKE_PRINCIPAL_LOCK hold out of `available` (double-
  // subtracting it here was rev05's explicitly named double-count bug).
  // Falls back to "0" for a coin the local-balance response doesn't (yet)
  // carry an `ok` row for — real gating on that absence is
  // `deriveStakeEntryState`'s job (BALANCE_UNKNOWN), not this display helper's.
  const availableFor = (coin: string) => {
    const lb = localCoins.find((c) => c.coin === coin);
    return lb?.state === 'ok' && lb.available != null ? new Decimal(lb.available) : new Decimal(0);
  };

  const entryState = deriveStakeEntryState({ loading, products, localCoins });

  const handleStakeSubmit = async (productId: string, amount: string) => {
    try {
      // AR-3/DC-11 — no `autoRenew` argument exists on `stake()` any more;
      // the request body can never carry that key from this call site.
      await stake(productId, amount);
      await load();
    } catch (e) {
      const err = e as Error & { code?: string; params?: Record<string, string> };
      const localized = new Error(localizeStakeError(err, t)) as Error & { code?: string };
      localized.code = err.code;
      throw localized;
    }
  };

  const handleDismissNotice = (ids: string[]) => {
    dismissRenewalNotices(ids);
    setNoticeVersion((v) => v + 1);
  };

  // S3 — positions with a renewal outcome inside the last 14 days, not yet
  // dismissed. `renewalProcessedAt` is not currently serialized to the
  // client (see report) — `maturityAt` is the closest available proxy,
  // since renewal is decided inside the same transaction as the maturity
  // flip (PRD §6.2), so the two timestamps are effectively the same moment.
  const visibleRenewals = useMemo(() => {
    const cutoff = now - FOURTEEN_DAYS_MS;
    return positions.filter((p) => {
      if (p.renewalStatus === 'NONE' || p.renewalStatus === 'FAILED_ACCOUNT_INACTIVE') return false;
      const processedAt = new Date(p.maturityAt).getTime();
      if (Number.isNaN(processedAt) || processedAt < cutoff) return false;
      return !isRenewalNoticeDismissed(p.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, now, noticeVersion]);

  // B2 YIELD PANEL rows — one per coin the user has ever staked. PS-A: ① is
  // the server-ledgered SUM(ledgeredYield) (§7 rewards route), ② is always
  // "0" (no claim rail exists to have moved anything yet), ③ is the
  // server's own lockedPrincipal (never client-summed).
  const yieldRows: YieldPanelRow[] = useMemo(() => {
    if (positions.length === 0) return [];
    const coins = Array.from(new Set(positions.map((p) => p.coin)));
    return coins.map((coin) => ({
      coin,
      ledgered: rewards?.totalByCoin[coin] ?? '0',
      claimed: '0',
      locked: lockedPrincipal[coin] ?? '0',
    }));
  }, [positions, rewards, lockedPrincipal]);

  const activePositionCount = positions.filter((p) => p.status === 'ACTIVE').length;

  // T-8 FRD §5.6 / T-12 ruling §3 (EG-T9-1) — the coin's own `yieldRail`
  // (LEDGER_ONLY vs CLAIM_LIVE), read by StakeSheet's STEP 3 to decide
  // whether `claimSeparate` (ⓓ) is still a true sentence (CP1-2).
  const yieldRailFor = (coin: string) => localCoins.find((c) => c.coin === coin)?.yieldRail;

  // UF-5 (position → canvas): close S-POS, scroll the page back up to B1,
  // and hand the well id to DeepCoreEmbed so it can pan/highlight it (CH-2).
  const handleFocusWell = (positionId: string) => {
    setSheetOpen(null);
    setFocusWellId(positionId);
    document.getElementById('deep-core-canvas-box')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="bana-page flex-1 min-h-full bg-[#06132a] text-[#d8e2ff] p-4 sm:p-6 lg:p-8 flex flex-col gap-4 overflow-y-auto">
      <header className="pb-2 border-b border-[#1E3559]/40">
        <h1 data-testid="staking-title" className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
          <Coins className="h-7 w-7 text-[#528dff]" /> {t('pageTitle')}
        </h1>
        <p className="text-xs sm:text-sm text-[#8c90a0] mt-1 font-mono">{t('pageSubtitle')}</p>
      </header>

      {loading ? (
        <div className="flex items-center gap-2.5 py-10 justify-center"><Loader2 className="h-5 w-5 text-[#528dff] animate-spin" /><span className="text-sm text-[#8c90a0]">{t('loading')}</span></div>
      ) : (
        <>
          {/* B1 STAGE — DEEP CORE canvas + HUD.
              CH-1/CH-2 (§4.1): `onOpenStake` opens S-STAKE from the HUD's
              empty-rig CTA; `focusWellId` lets a position row's well badge
              pan the canvas to that well (UF-5, position → canvas).
              T-12 ruling EG-T9-1 — the prop is only ever HANDED to the game
              at all when execution is actually `READY`; every other entry
              state passes `undefined`, not a disabled/no-op callback, so
              DeepCoreHud's own `onOpenStake != null` gate (EG-T9-2) can
              suppress the CTA without the game surface knowing *why*
              (EG-3 — the game reads "was I given an action", never "what
              wallet/compliance state blocked it"). */}
          <DeepCoreEmbed
            game={gameState}
            loading={loading}
            onWellClick={(positionId) => { setFocusPositionId(positionId); setSheetOpen('positions'); }}
            onOpenStake={entryState.kind === 'READY' ? () => setSheetOpen('stake') : undefined}
            focusWellId={focusWellId}
          />

          {/* B2 YIELD PANEL */}
          <YieldPanel rows={yieldRows} />

          {/* B3 VAULT BAR — AC-T8-05: the [Stake] slot becomes a non-button
              status chip (still opens S-STAKE, per §3.4's "STEP 1 진입:
              열 수 있다" — only the promise-of-action styling/label changes,
              never a `disabled` action button) whenever `entryState` isn't
              `READY`. */}
          <VaultControlBar
            positionCount={activePositionCount}
            stakeReady={entryState.kind === 'READY'}
            onStakeClick={() => setSheetOpen('stake')}
            onPositionsClick={() => setSheetOpen('positions')}
            onYieldClick={() => setSheetOpen('yield')}
          />

          {/* B4 RIG BAR — Crew/Depot/Ledger. Rendered here (after B3, before
              B5) per the FRD's B1→B2→B3→B4→B5 order. `DeepCoreControlBar`
              takes a non-nullable `game`, so it's gated on the same
              null/loading/S0_NOT_SHOWN/S5_DISABLED conditions DeepCoreEmbed
              itself uses to suppress its own render, plus `!hidden` so it
              disappears together with B1 when the user hides DEEP CORE. */}
          {!hidden && !loading && gameState && gameState.surfaceState !== 'S0_NOT_SHOWN' && gameState.surfaceState !== 'S5_DISABLED' && (
            <DeepCoreControlBar game={gameState} crewState={deriveDeepCoreCrewState(gameState)} />
          )}

          {/* B5 INLINE NOTICES */}
          <InlineNotices
            positions={positions}
            visibleRenewals={visibleRenewals}
            products={products}
            onDismiss={handleDismissNotice}
          />
        </>
      )}

      {sheetOpen === 'stake' && (
        <StakeSheet
          products={products}
          entryState={entryState}
          availableFor={availableFor}
          yieldRailFor={yieldRailFor}
          onSubmit={handleStakeSubmit}
          onReload={load}
          onOpenPositions={() => setSheetOpen('positions')}
          onClose={() => setSheetOpen(null)}
        />
      )}
      {sheetOpen === 'positions' && (
        <PositionsSheet
          positions={positions}
          products={products}
          gameState={gameState}
          now={now}
          focusPositionId={focusPositionId}
          onClearFocus={() => setFocusPositionId(null)}
          onFocusWell={handleFocusWell}
          onClose={() => setSheetOpen(null)}
        />
      )}
      {sheetOpen === 'yield' && (
        <YieldSheet positions={positions} onClose={() => setSheetOpen(null)} />
      )}
    </div>
  );
}
