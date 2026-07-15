'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { SystemSettings } from '../types';
import {
  TrendingUp,
  TrendingDown,
  HelpCircle,
  ChevronRight,
  Download,
  Upload,
  Layers,
  Sparkles,
  Eye,
  EyeOff,
} from 'lucide-react';
import Decimal from 'decimal.js';
import { useTranslations } from 'next-intl';
import { getNiaBalance, getNiaPrice, getNiaKlines } from '../utils/niaApi';
import StakedSummaryCard from './staking/StakedSummaryCard';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** One row as we need it internally — all amounts stay as Decimal. */
interface PortfolioAsset {
  currency: string;
  amount: Decimal;       // balance + locked
  price: Decimal;        // USD per unit (0 when unknown)
  changePct: Decimal;    // 24h %, 0 when unknown
  hasPrice: boolean;     // false → no active market
}

// ---------------------------------------------------------------------------
// Stablecoin list
// ---------------------------------------------------------------------------

const STABLECOINS = new Set(['USDT', 'USDC', 'DAI', 'FDUSD', 'TUSD', 'BUSD']);

// The portfolio headline is denominated in this coin rather than USD: every
// asset's USD value is summed, then divided by this coin's USD price.
const HEADLINE_COIN = 'BANA';

/** 1234.5 -> "1,234.50" — two decimals with thousands separators. */
function fmtAmount(d: Decimal): string {
  const [whole, frac] = d.toFixed(2).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${frac}`;
}

// ---------------------------------------------------------------------------
// Balance shape parser (defensive — accepts array OR object with array props)
// ---------------------------------------------------------------------------

interface RawBalanceRow {
  currency: string;
  balance: string;
  locked: string;
  walletType?: string;
}

// Safe Decimal parse — Nia-Hub can return "" / non-numeric fields for an
// uninitialized wallet, and new Decimal("") THROWS. Never let a bad field crash
// the portfolio load (which would freeze it on the skeleton forever).
function safeDec(v: unknown): Decimal {
  try { return new Decimal(v == null || v === '' ? '0' : (v as string)); }
  catch { return new Decimal(0); }
}

function flattenBalanceData(raw: unknown): RawBalanceRow[] {
  if (Array.isArray(raw)) {
    return raw as RawBalanceRow[];
  }
  if (raw !== null && typeof raw === 'object') {
    const rows: RawBalanceRow[] = [];
    for (const val of Object.values(raw as Record<string, unknown>)) {
      if (Array.isArray(val)) {
        rows.push(...(val as RawBalanceRow[]));
      }
    }
    return rows;
  }
  return [];
}

// ---------------------------------------------------------------------------
// Donut chart helpers
// ---------------------------------------------------------------------------

const DONUT_COLORS = [
  '#6366f1', // indigo
  '#10b981', // emerald
  '#f59e0b', // amber
  '#a855f7', // purple
  '#06b6d4', // cyan
  '#f43f5e', // rose
  '#84cc16', // lime
  '#fb923c', // orange
];

const DONUT_R = 38;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_R;

interface DonutSlice {
  currency: string;
  pct: Decimal;   // 0–100
  color: string;
}

function buildDonutSlices(assets: PortfolioAsset[], total: Decimal): DonutSlice[] {
  if (total.isZero()) return [];
  return assets
    .filter((a) => a.price.gt(0) && a.amount.gt(0))
    .map((a, i) => ({
      currency: a.currency,
      pct: a.amount.mul(a.price).div(total).mul(100),
      color: DONUT_COLORS[i % DONUT_COLORS.length],
    }))
    .sort((x, y) => (y.pct.gt(x.pct) ? 1 : -1));
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DashboardProps {
  settings: SystemSettings;
  onNavigate: (toScreen: any, direction: any) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Dashboard({ settings, onNavigate }: DashboardProps) {
  const t = useTranslations('dashboard');
  const { data: session } = useSession();

  // Privacy toggle — hide balances (persisted) so amounts aren't visible over the shoulder.
  const [hideBalance, setHideBalance] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') setHideBalance(localStorage.getItem('bana_hideBalance') === '1');
  }, []);
  const toggleHideBalance = () => {
    setHideBalance((prev) => {
      const next = !prev;
      try { localStorage.setItem('bana_hideBalance', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };
  // Replace any value with dots when balances are hidden.
  const mask = (v: string) => (hideBalance ? '••••••' : v);
  // ---- UI state -----------------------------------------------------------
  const [hoveredAsset, setHoveredAsset] = useState<string | null>(null);
  const [showAllocInfo, setShowAllocInfo] = useState(false);
  const [chartCursor, setChartCursor] = useState<{ index: number; value: Decimal } | null>(null);

  // ---- Data state ---------------------------------------------------------
  const [loading, setLoading] = useState(true);
  const [portfolioAssets, setPortfolioAssets] = useState<PortfolioAsset[]>([]);
  const [totalValue, setTotalValue] = useState<Decimal>(new Decimal(0));
  // USD price of HEADLINE_COIN; null when its market is unavailable.
  const [headlinePrice, setHeadlinePrice] = useState<Decimal | null>(null);
  const [headline24hChange, setHeadline24hChange] = useState<Decimal>(new Decimal(0));
  const [klinePoints, setKlinePoints] = useState<Decimal[]>([]);
  const [klineLoading, setKlineLoading] = useState(true);

  // ---- Fetch balances + prices -------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      // 1. Fetch raw balance data
      let rawData: unknown;
      try {
        rawData = await getNiaBalance();
      } catch {
        rawData = [];
      }

      const rows = flattenBalanceData(rawData);

      // 2. Aggregate per currency: sum balance + locked across all wallet types
      const bySymbol = new Map<string, Decimal>();
      for (const row of rows) {
        if (!row.currency) continue;
        const bal = safeDec(row.balance);
        const lkd = safeDec(row.locked);
        const prev = bySymbol.get(row.currency) ?? new Decimal(0);
        bySymbol.set(row.currency, prev.plus(bal).plus(lkd));
      }

      // Filter to non-zero totals only
      const nonZero: Array<{ currency: string; amount: Decimal }> = [];
      for (const [currency, amount] of bySymbol.entries()) {
        if (amount.gt(0)) nonZero.push({ currency, amount });
      }

      if (cancelled) return;

      if (nonZero.length === 0) {
        setPortfolioAssets([]);
        setTotalValue(new Decimal(0));
        setHeadline24hChange(new Decimal(0));
        setLoading(false);
        return;
      }

      // 3. Fetch prices in parallel — per-asset prices, plus BANA's own price so
      //    the headline total can be denominated in BANA rather than USD.
      const [priceResults, banaResult] = await Promise.all([
        Promise.all(
          nonZero.map(({ currency }) => {
            if (STABLECOINS.has(currency)) {
              return Promise.resolve({ price: '1', changePct: '0' } as { price: string; changePct: string } | null);
            }
            return getNiaPrice(`SPOT:${currency}_USDT`);
          }),
        ),
        getNiaPrice(`SPOT:${HEADLINE_COIN}_USDT`),
      ]);

      if (cancelled) return;

      setHeadlinePrice(banaResult ? safeDec(banaResult.price) : null);

      // 4. Build PortfolioAsset list
      const builtAssets: PortfolioAsset[] = nonZero.map((item, i) => {
        const result = priceResults[i];
        if (result === null) {
          return {
            currency: item.currency,
            amount: item.amount,
            price: new Decimal(0),
            changePct: new Decimal(0),
            hasPrice: false,
          };
        }
        return {
          currency: item.currency,
          amount: item.amount,
          price: safeDec(result.price),
          changePct: safeDec(result.changePct),
          hasPrice: true,
        };
      });

      // 5. Compute total USD value (only assets with known price)
      const total = builtAssets.reduce((acc, a) => {
        return acc.plus(a.amount.mul(a.price));
      }, new Decimal(0));

      // 6. Portfolio-weighted headline 24h change = sum(value_i * changePct_i) / total
      let weightedChange = new Decimal(0);
      if (total.gt(0)) {
        weightedChange = builtAssets.reduce((acc, a) => {
          const assetValue = a.amount.mul(a.price);
          return acc.plus(assetValue.mul(a.changePct));
        }, new Decimal(0)).div(total);
      }

      setPortfolioAssets(builtAssets);
      setTotalValue(total);
      setHeadline24hChange(weightedChange);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // ---- Fetch BTC sparkline ------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    setKlineLoading(true);

    getNiaKlines('SPOT:BTC_USDT', '1d', 30).then((candles) => {
      if (cancelled) return;
      if (!Array.isArray(candles) || candles.length === 0) {
        setKlinePoints([]);
        setKlineLoading(false);
        return;
      }
      // Each candle is [openTime, open, high, low, close, volume]; close = index 4
      const closes = candles
        .map((c) => {
          const raw = Array.isArray(c) ? c[4] : c?.close;
          if (raw == null) return null;
          try { return new Decimal(raw); } catch { return null; }
        })
        .filter((d): d is Decimal => d !== null);
      setKlinePoints(closes);
      setKlineLoading(false);
    }).catch(() => {
      if (!cancelled) {
        setKlinePoints([]);
        setKlineLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, []);

  // ---- Derived values -----------------------------------------------------
  const donutSlices = buildDonutSlices(portfolioAssets, totalValue);

  // Headline total, denominated in HEADLINE_COIN. An empty portfolio is 0 in any
  // currency, so it needs no price; otherwise we can only convert when we know
  // the coin's price — null means "can't express this yet", never a wrong number.
  const totalInHeadlineCoin: Decimal | null = totalValue.isZero()
    ? new Decimal(0)
    : headlinePrice && headlinePrice.gt(0)
      ? totalValue.div(headlinePrice)
      : null;

  const headlineIsPositive = headline24hChange.gte(0);

  const distinctAssets = portfolioAssets.length;

  // ---- Rendering helpers --------------------------------------------------

  const renderMiniLogo = (symbol: string) => {
    switch (symbol) {
      case 'ETH':
        return (
          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-indigo-400/30">
            <span className="text-xs font-bold text-indigo-300">Ξ</span>
          </div>
        );
      case 'BTC':
        return (
          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-amber-400/30">
            <span className="text-xs font-bold text-amber-400">₿</span>
          </div>
        );
      case 'USDC':
      case 'USDT':
        return (
          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-blue-400/30">
            <span className="text-xs font-bold text-blue-400">$</span>
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-600">
            <span className="text-[11px] font-bold text-slate-300">{symbol.slice(0, 2)}</span>
          </div>
        );
    }
  };

  // ---- Donut SVG ----------------------------------------------------------
  const renderDonut = () => {
    if (loading) {
      return (
        <div className="w-36 h-36 rounded-full bg-slate-800/60 animate-pulse flex items-center justify-center">
          <span className="text-[10px] font-mono text-slate-500">{t('loading')}</span>
        </div>
      );
    }

    if (donutSlices.length === 0) {
      return (
        <div className="w-36 h-36 rounded-full border-4 border-slate-700 flex items-center justify-center">
          <span className="text-[10px] font-mono text-slate-500 text-center px-2">{t('noAssets')}</span>
        </div>
      );
    }

    // Build SVG arcs
    let offset = new Decimal(0);
    const totalCirc = new Decimal(DONUT_CIRCUMFERENCE);

    return (
      <div className="relative w-36 h-36">
        <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
          {donutSlices.map((slice) => {
            const dashLen = slice.pct.div(100).mul(totalCirc);
            const dashGap = totalCirc.minus(dashLen);
            const dashOffset = offset.negated();
            offset = offset.plus(dashLen);
            return (
              <circle
                key={slice.currency}
                cx="50"
                cy="50"
                r={DONUT_R}
                stroke={slice.color}
                strokeWidth="11"
                strokeDasharray={`${dashLen.toFixed(4)} ${dashGap.toFixed(4)}`}
                strokeDashoffset={dashOffset.toFixed(4)}
                fill="transparent"
                className="transition-all duration-300 hover:stroke-[13px] cursor-pointer"
                onMouseEnter={() => setHoveredAsset(slice.currency)}
                onMouseLeave={() => setHoveredAsset(null)}
              />
            );
          })}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
          <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wide">
            {hoveredAsset ?? t('assets')}
          </span>
          <span className="text-xl font-bold font-mono text-white mt-0.5">
            {hoveredAsset
              ? (() => {
                  const s = donutSlices.find((x) => x.currency === hoveredAsset);
                  return s ? `${s.pct.toFixed(1)}%` : '';
                })()
              : distinctAssets}
          </span>
        </div>
      </div>
    );
  };

  // ---- Kline sparkline SVG ------------------------------------------------
  const renderSparkline = () => {
    if (klineLoading) {
      return (
        <div className="h-32 mt-2 w-full flex items-center justify-center">
          <span className="text-xs font-mono text-slate-500">{t('loadingPriceData')}</span>
        </div>
      );
    }

    if (klinePoints.length < 2) {
      return (
        <div className="h-32 mt-2 w-full flex items-center justify-center">
          <span className="text-xs font-mono text-slate-500">{t('noPriceHistory')}</span>
        </div>
      );
    }

    const minVal = klinePoints.reduce((m, v) => (v.lt(m) ? v : m), klinePoints[0]);
    const maxVal = klinePoints.reduce((m, v) => (v.gt(m) ? v : m), klinePoints[0]);
    const range = maxVal.minus(minVal);
    const safeRange = range.isZero() ? new Decimal(1) : range;

    const svgW = 200;
    const svgH = 80;
    const padY = 5;

    const points = klinePoints.map((val, idx) => {
      const x = new Decimal(idx).div(klinePoints.length - 1).mul(svgW);
      const y = new Decimal(svgH)
        .minus(val.minus(minVal).div(safeRange).mul(svgH - padY * 2))
        .minus(padY);
      return { x, y, val };
    });

    const pathD = `M ${points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' L ')}`;
    const areaD = `${pathD} L ${svgW},${svgH} L 0,${svgH} Z`;

    const latestClose = klinePoints[klinePoints.length - 1];
    const displayVal = chartCursor ? chartCursor.value : latestClose;

    return (
      <div className="h-32 mt-2 w-full relative">
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="w-full h-full"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const index = Math.round(ratio * (klinePoints.length - 1));
            setChartCursor({ index, value: klinePoints[index] });
          }}
          onMouseLeave={() => setChartCursor(null)}
        >
          <defs>
            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1="0" y1="20" x2={svgW} y2="20" stroke="#1e293b" strokeWidth="0.25" strokeDasharray="3 3" />
          <line x1="0" y1="50" x2={svgW} y2="50" stroke="#1e293b" strokeWidth="0.25" strokeDasharray="3 3" />
          <path d={areaD} fill="url(#chartGradient)" />
          <path d={pathD} fill="none" stroke="#6366f1" strokeWidth="1.7" strokeLinecap="round" />
          {points.map((p, idx) => (
            <circle
              key={idx}
              cx={p.x.toFixed(2)}
              cy={p.y.toFixed(2)}
              r={chartCursor?.index === idx ? '3.5' : '1.5'}
              fill={chartCursor?.index === idx ? '#ffffff' : '#6366f1'}
              stroke="#0f172a"
              strokeWidth="1"
              className="transition-all duration-150"
            />
          ))}
        </svg>

        <div className="absolute right-2 bottom-0 flex items-center gap-1.5 font-mono text-xs select-none">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 block animate-ping" />
          <span className="text-slate-400">BTC:</span>
          <span className="text-white font-bold">
            ${displayVal.toNumber().toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>
    );
  };

  // ---- Main render --------------------------------------------------------

  return (
    <div className="flex-1 min-h-full bg-[#020617] text-slate-100 p-4 sm:p-6 lg:p-8 flex flex-col gap-6 overflow-y-auto">

      {/* 1. Header Bar */}
      <header className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center bg-[#020617]">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex flex-wrap items-center gap-2">
            {t('pageTitle')}
            <span className="text-[10px] sm:text-xs font-mono font-bold bg-indigo-500/10 px-2.5 py-0.5 rounded text-indigo-400 uppercase tracking-widest border border-indigo-500/20">
              {t('securedBadge')}
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-mono break-all">
            {t('vaultSubtitle', { account: session?.user?.email ?? '' })}
          </p>
        </div>

        <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
          <button
            onClick={() => onNavigate('WALLET_INTERFACE', 'push')}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/60 text-slate-200 rounded-xl font-bold text-sm transition-all duration-200 flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <Download className="h-4 w-4 text-slate-400" />
            {t('receive')}
          </button>

          <button
            onClick={() => onNavigate('WALLET_INTERFACE', 'push')}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm transition-all duration-200 flex items-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(99,102,241,0.25)] border border-indigo-500/30"
          >
            <Upload className="h-4 w-4" />
            {t('send')}
          </button>

        </div>
      </header>

      {/* Get-started strip — shown only to new users with no assets yet */}
      {!loading && portfolioAssets.length === 0 && (
        <section className="shrink-0 p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-indigo-600/15 via-indigo-600/5 to-transparent border border-indigo-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-400" /> {t('getStartedTitle')}
            </h3>
            <p className="text-xs text-slate-400 max-w-md">{t('getStartedBody')}</p>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-1 text-[11px] font-mono text-slate-400">
              <span><span className="text-indigo-400 font-bold">1.</span> {t('stepDeposit')}</span>
              <span><span className="text-indigo-400 font-bold">2.</span> {t('stepSwap')}</span>
              <span><span className="text-indigo-400 font-bold">3.</span> {t('stepTrack')}</span>
            </div>
          </div>
          <button
            onClick={() => onNavigate('DEPOSIT_INTERFACE', 'slide_up')}
            className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-colors cursor-pointer shadow-[0_0_15px_rgba(99,102,241,0.25)]"
          >
            <Download className="h-4 w-4" /> {t('getStartedCta')}
          </button>
        </section>
      )}

      {/* 2. Top Summary Metrics Card */}
      <section className="shrink-0 p-5 sm:p-8 rounded-3xl bg-slate-900 border border-slate-800 relative overflow-hidden shadow-xl bento-hover">
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-indigo-500/5 via-transparent to-transparent pointer-events-none" />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          {/* Total portfolio value */}
          <div>
            <span className="text-xs font-mono text-slate-400 uppercase tracking-widest font-bold flex items-center gap-2">
              {t('totalPortfolioValue')}
              <button
                onClick={toggleHideBalance}
                aria-label={hideBalance ? t('showBalance') : t('hideBalance')}
                title={hideBalance ? t('showBalance') : t('hideBalance')}
                className="text-slate-500 hover:text-slate-200 transition-colors cursor-pointer"
              >
                {hideBalance ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </span>
            <div className="flex items-baseline gap-2 mt-2">
              {loading ? (
                <div className="h-10 w-48 rounded-lg bg-slate-800 animate-pulse" />
              ) : (
                <>
                  <h2 className="text-3xl sm:text-4xl xl:text-5xl font-black font-sans tracking-tight text-white whitespace-nowrap">
                    {hideBalance
                      ? '••••••'
                      : totalInHeadlineCoin
                        ? `${fmtAmount(totalInHeadlineCoin)} ${HEADLINE_COIN}`
                        : '—'}
                  </h2>
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${
                    headlineIsPositive
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                  }`}>
                    {headlineIsPositive
                      ? <TrendingUp className="h-3.5 w-3.5" />
                      : <TrendingDown className="h-3.5 w-3.5" />}
                    {headlineIsPositive ? '+' : ''}{headline24hChange.toFixed(2)}%
                  </span>
                </>
              )}
            </div>
          </div>

          {/* 24h change detail */}
          <div className="border-t border-slate-800 md:border-t-0 md:border-l md:pl-8 py-1">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-widest font-bold">
              {t('change24h')}
            </span>
            {loading ? (
              <div className="h-8 w-32 rounded-lg bg-slate-800 animate-pulse mt-1.5" />
            ) : (
              <p className={`text-2xl font-bold font-sans mt-1.5 ${headlineIsPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {headlineIsPositive ? '+' : ''}{headline24hChange.toFixed(2)}%
              </p>
            )}
          </div>

          {/* Distinct assets held */}
          <div className="border border-indigo-500/10 rounded-2xl bg-indigo-500/5 md:border-none md:rounded-none md:bg-transparent md:border-l md:pl-8 py-3 px-4 md:py-1 md:px-0">
            <span className="text-xs font-mono text-indigo-300 md:text-slate-400 uppercase tracking-widest font-bold">
              {t('assetsHeld')}
            </span>
            {loading ? (
              <div className="h-8 w-20 rounded-lg bg-slate-800 animate-pulse mt-1.5" />
            ) : (
              <p className="text-2xl font-bold font-sans text-indigo-400 md:text-slate-200 mt-1.5 flex items-center gap-2">
                {String(distinctAssets).padStart(2, '0')}
                <span className="text-[10px] bg-indigo-500/10 text-indigo-400 font-bold border border-indigo-500/20 px-1.5 py-0.5 rounded uppercase font-sans">
                  {t('live')}
                </span>
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Staked coin + live earnings (only shows if the user has a stake) */}
      <StakedSummaryCard onOpen={() => onNavigate('STAKING_INTERFACE', 'push')} />

      {/* 3. Main Split Board Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left Column — Allocation Donut + BTC Price Sparkline */}
        <div className="lg:col-span-5 min-w-0 flex flex-col gap-6">

          {/* Asset Allocation Donut */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col gap-4 bento-hover shadow-lg">
            <div className="flex justify-between items-center">
              <h3 className="font-sans font-bold text-slate-100 text-[15px] uppercase tracking-wider">
                {t('assetAllocation')}
              </h3>
              <div className="relative">
                <button
                  onClick={() => setShowAllocInfo((v) => !v)}
                  aria-label={t('allocationInfoLabel')}
                  aria-expanded={showAllocInfo}
                  className={`p-1 transition-colors cursor-pointer ${showAllocInfo ? 'text-indigo-400' : 'text-slate-400 hover:text-white'}`}
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
                {showAllocInfo && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowAllocInfo(false)} />
                    <div className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-3rem)] p-3.5 bg-slate-950 border border-slate-700 rounded-xl shadow-2xl shadow-black/40 z-50 text-left">
                      <p className="text-[12px] font-bold text-white mb-1">{t('allocationInfoTitle')}</p>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        {t('allocationInfoBody')}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-6 justify-center py-2 h-44">
              {renderDonut()}

              {/* Dynamic legends */}
              <div className="flex flex-col gap-2 font-mono text-xs select-none">
                {loading ? (
                  <span className="text-slate-500">{t('loadingEllipsis')}</span>
                ) : donutSlices.length === 0 ? (
                  <span className="text-slate-500">{t('noAssets')}</span>
                ) : (
                  donutSlices.slice(0, 6).map((slice) => (
                    <div key={slice.currency} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full block flex-shrink-0" style={{ backgroundColor: slice.color }} />
                      <span className="text-slate-400">
                        {slice.currency} ({slice.pct.toFixed(1)}%)
                      </span>
                    </div>
                  ))
                )}
                {!loading && donutSlices.length > 6 && (
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-600 block flex-shrink-0" />
                    <span className="text-slate-400">{t('moreAssets', { count: donutSlices.length - 6 })}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* BTC Price Sparkline (30d, real kline data) */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col gap-3 bento-hover shadow-lg">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-sans font-bold text-slate-100 text-[15px] uppercase tracking-wider">
                  {t('btcPrice30d')}
                </h3>
                <p className="text-[10px] font-mono text-slate-500 mt-0.5">{t('btcPriceSubtitle')}</p>
              </div>
              <Layers className="h-4 w-4 text-indigo-400 opacity-60" />
            </div>
            {renderSparkline()}
          </div>
        </div>

        {/* Right Column — Asset Table */}
        <div className="lg:col-span-7 min-w-0 p-6 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col justify-between bento-hover shadow-lg">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 border-b border-slate-800 pb-4">
              <h3 className="font-sans font-bold text-slate-100 text-[15px] uppercase tracking-wider">
                {t('currentAssets')}
              </h3>
            </div>

            {loading ? (
              <div className="flex flex-col gap-3 mt-4">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-12 rounded-xl bg-slate-800/60 animate-pulse" />
                ))}
              </div>
            ) : portfolioAssets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <Sparkles className="h-10 w-10 text-slate-600" />
                <p className="text-slate-300 font-bold text-base">{t('noAssetsTitle')}</p>
                <p className="text-slate-500 text-sm max-w-xs">
                  {t('noAssetsBody')}
                </p>
                <button
                  onClick={() => onNavigate('DEPOSIT_INTERFACE', 'push')}
                  className="mt-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm transition-all duration-200 cursor-pointer"
                >
                  {t('depositNow')}
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-2 px-2">
                <table className="w-full min-w-[520px] text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800/80 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                      <th className="pb-3 font-semibold">{t('tableToken')}</th>
                      <th className="pb-3 text-right font-semibold">{t('tablePrice')}</th>
                      <th className="pb-3 text-right font-semibold">{t('tableChange24h')}</th>
                      <th className="pb-3 text-right font-semibold">{t('tableAmount')}</th>
                      <th className="pb-3 text-right font-semibold">{t('tableValue')}</th>
                      <th className="pb-3 text-right font-semibold">{t('tableAlloc')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {portfolioAssets.map((asset) => {
                      const assetUsdValue = asset.amount.mul(asset.price);
                      const allocPct = totalValue.gt(0)
                        ? assetUsdValue.div(totalValue).mul(100)
                        : new Decimal(0);
                      const isPositive = asset.changePct.gte(0);

                      return (
                        <tr
                          key={asset.currency}
                          className="hover:bg-slate-800/30 transition-colors group cursor-pointer"
                        >
                          <td className="py-3.5 pr-2">
                            <div className="flex items-center gap-3">
                              {renderMiniLogo(asset.currency)}
                              <div>
                                <div className="font-semibold text-[15px] text-white group-hover:text-indigo-400 transition-colors">
                                  {asset.currency}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-2 text-right font-mono text-xs text-white">
                            {asset.hasPrice
                              ? `$${asset.price.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
                              : <span className="text-slate-500 text-[10px]">{t('noMarket')}</span>}
                          </td>

                          <td className="py-3.5 px-2 text-right">
                            {asset.hasPrice ? (
                              <span className={`font-mono text-xs font-semibold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {isPositive ? '+' : ''}{asset.changePct.toFixed(2)}%
                              </span>
                            ) : (
                              <span className="text-slate-500 text-[10px]">—</span>
                            )}
                          </td>

                          <td className="py-3.5 px-2 text-right font-mono text-xs text-white">
                            {/* Show enough precision without trailing zeros */}
                            {mask(asset.amount.toSignificantDigits(6).toString())}
                            <div className="text-[10px] text-slate-400">{asset.currency}</div>
                          </td>

                          <td className="py-3.5 px-2 text-right font-mono text-xs font-bold text-white">
                            {asset.hasPrice
                              ? mask(`$${assetUsdValue.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`)
                              : <span className="text-slate-500 text-[10px]">n/a</span>}
                          </td>

                          <td className="py-3.5 pl-2 text-right font-mono text-xs text-slate-400">
                            {asset.hasPrice && totalValue.gt(0)
                              ? `${allocPct.toFixed(1)}%`
                              : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-5 pt-3 border-t border-slate-800 flex justify-between items-center text-xs">
            <span className="text-slate-400">
              {loading ? t('fetchingBalances') : t('assetsWithBalance', { count: portfolioAssets.length })}
            </span>
            <a
              href="#swap"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('SWAP_INTERFACE', 'push');
              }}
              className="text-indigo-400 hover:text-indigo-300 font-bold font-sans flex items-center gap-1 group/link transition-colors cursor-pointer"
            >
              <span>{t('goToSwap')}</span>
              <ChevronRight className="h-4 w-4 group-hover/link:translate-x-0.5 transition-transform" />
            </a>
          </div>
        </div>
      </div>

      {/* 4. Security Footer */}
      <footer className="mt-auto bg-indigo-500/5 border border-indigo-500/10 p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 select-none">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400">
            <Sparkles className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white tracking-wide">
              {t('footerTitle')}
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">
              {t('footerBody')}
            </p>
          </div>
        </div>
        <div className="text-xs font-mono font-bold text-indigo-400 border border-indigo-500/25 px-3 py-1.5 rounded-xl bg-indigo-500/5">
          {t('consensusSecure')}
        </div>
      </footer>
    </div>
  );
}
