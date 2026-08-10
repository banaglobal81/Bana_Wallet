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
import { getNiaBalance } from '../utils/niaApi';
import DeepCoreEmbed, { DeepCoreControlBar, deriveDeepCoreCrewState, useDeepCoreHidden } from './staking/deep-core/DeepCoreEmbed';
import YieldPanel, { type YieldPanelRow } from './staking/YieldPanel';
import VaultControlBar from './staking/VaultControlBar';
import InlineNotices from './staking/InlineNotices';
import StakeSheet from './staking/sheets/StakeSheet';
import PositionsSheet from './staking/sheets/PositionsSheet';
import YieldSheet from './staking/sheets/YieldSheet';
import {
  AUTO_RENEW_MAX_TERM_DAYS, FOURTEEN_DAYS_MS, isRenewalNoticeDismissed, dismissRenewalNotices,
} from './staking/renewalCopy';

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

// Aggregate free balance per coin from a Nia /wallets payload.
function aggregateBalances(raw: unknown): Map<string, Decimal> {
  const rows: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? Object.values(raw as Record<string, unknown>).flatMap((v) => (Array.isArray(v) ? v : []))
      : [];
  const m = new Map<string, Decimal>();
  for (const r of rows as Array<{ currency?: string; balance?: string }>) {
    if (!r?.currency) continue;
    m.set(r.currency, (m.get(r.currency) ?? new Decimal(0)).plus(new Decimal(r.balance ?? '0')));
  }
  return m;
}

// docs/specs/staking-page-v2-screen-flow-frd.md §7.1 R-D5 / §7.2 — map the
// stake route's stable error `code` to a localized `staking.error.<code>`
// string. Unknown/absent codes fall back to `error.GENERIC`; the raw
// server-English message is never shown to the user (T-7 / AC-19).
const KNOWN_STAKE_ERROR_CODES = new Set([
  'STAKE_INVALID_AMOUNT', 'STAKE_PRODUCT_NOT_FOUND', 'STAKE_PRODUCT_CLOSED', 'STAKE_PRODUCT_FULL',
  'STAKE_BELOW_MIN', 'STAKE_ABOVE_MAX', 'STAKE_INSUFFICIENT_AVAILABLE', 'UNAUTHENTICATED',
]);
function localizeStakeError(err: Error & { code?: string; params?: Record<string, string> }, t: ReturnType<typeof useTranslations>): string {
  const code = err.code && KNOWN_STAKE_ERROR_CODES.has(err.code) ? err.code : 'GENERIC';
  return t(`error.${code}` as 'error.GENERIC', err.params);
}

type SheetId = 'stake' | 'positions' | 'yield' | null;

export default function Staking({ onNavigate: _onNavigate }: StakingProps) {
  const t = useTranslations('staking');

  const [products, setProducts] = useState<StakingProduct[]>([]);
  const [positions, setPositions] = useState<StakePosition[]>([]);
  const [balances, setBalances] = useState<Map<string, Decimal>>(new Map());
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
      const [p, posAndGame, bal, rew] = await Promise.all([
        getStakingProducts(), getStakePositionsAndGame(), getNiaBalance().catch(() => []),
        getStakingRewards().catch(() => null),
      ]);
      setProducts(p);
      setPositions(posAndGame.positions);
      setGameState(posAndGame.game);
      setLockedPrincipal(posAndGame.lockedPrincipal);
      setBalances(aggregateBalances(bal));
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

  // Available (free) balance per coin = Nia balance − server-reported locked principal.
  const availableFor = (coin: string) =>
    Decimal.max(0, (balances.get(coin) ?? new Decimal(0)).minus(new Decimal(lockedPrincipal[coin] ?? '0')));

  const handleStakeSubmit = async (productId: string, amount: string, autoRenew: boolean) => {
    try {
      await stake(productId, amount, autoRenew);
      await load();
    } catch (e) {
      throw new Error(localizeStakeError(e as Error & { code?: string; params?: Record<string, string> }, t));
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
  // the server-ledgered SUM(paidInterest) (§7 rewards route), ② is always
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
              pan the canvas to that well (UF-5, position → canvas). */}
          <DeepCoreEmbed
            game={gameState}
            loading={loading}
            onWellClick={(positionId) => { setFocusPositionId(positionId); setSheetOpen('positions'); }}
            onOpenStake={() => setSheetOpen('stake')}
            focusWellId={focusWellId}
          />

          {/* B2 YIELD PANEL */}
          <YieldPanel rows={yieldRows} />

          {/* B3 VAULT BAR */}
          <VaultControlBar
            positionCount={activePositionCount}
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
          availableFor={availableFor}
          autoRenewMaxTermDays={AUTO_RENEW_MAX_TERM_DAYS}
          onSubmit={handleStakeSubmit}
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
          onPositionsChange={setPositions}
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
