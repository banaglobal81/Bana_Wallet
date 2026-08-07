'use client';

// The five bonus lines that make up the 35% payout cap, as a stacked bar plus
// expandable detail cards.
//
// The bar shows how the 35% pool is ALLOCATED — it is not a depiction of what
// any one person earns. Fast Start is per-sale; the other four scale with
// network volume, so a second bar puts the 35% back in the context of the full
// 100% of a sale.
import { useEffect, useState } from 'react';
import { ChevronDown, Check, Info } from 'lucide-react';
import type { BonusId, PackageId } from '@/types/compensation-plan';
import { calculateBonusBreakdown, formatUsd, isPackageId } from '@/lib/compensation/calc';
import { BONUSES, NETWORK_SHARE, PACKAGES, PAYOUT_CAP } from '@/lib/compensation/plan';
import { warnFixtureUsage } from '@/lib/compensation/fixtures';

/** English-locked UI + compliance copy (decision B2). Numbers come from `calc.ts`. */
const STRINGS = {
  heading: 'Bonus Structure',
  subheading: 'How the 35% payout pool is allocated company-wide',
  poolNote:
    'Fast Start is per-sale; the others scale with network volume. This bar shows allocation, not individual earnings.',
  capHeading: 'Every package sale',
  capPayout: 'Payout pool',
  capNetwork: 'Retained by network',
  legendLabel: 'Bonus allocation legend',
  barLabel: 'Allocation of the 35% payout pool across five bonus lines',
  capBarLabel: 'Split of each package sale between payout pool and network',
  detailsHeading: 'Bonus detail',
  exampleLabel: 'Example',
  gateLabel: 'Qualification',
  noGate: 'No gate, no minimum.',
  identicalRates: 'Bonus rates are identical on all three packages — by design.',
  feeBanner: 'Fee income may be $0 during network ramp-up.',
  valuedAgainst: 'Amounts shown against',
  expand: 'Expand',
  collapse: 'Collapse',
} as const;

/** Chart colours. Fixed hex so the swatches read identically in light and dark mode. */
const BONUS_COLORS: Readonly<Record<BonusId, string>> = {
  fastStart: '#4f46e5', // indigo-600
  binary: '#f59e0b', // amber-500
  match: '#10b981', // emerald-500
  rankPool: '#0ea5e9', // sky-500
  globalPool: '#f43f5e', // rose-500
};

export interface BonusBreakdownProps {
  /** Package whose price the USD amounts are valued against. Defaults to Orbit. */
  packageId?: string;
  /** USD volume to value the rates against. Overrides `packageId` when given. */
  monthlyVolume?: number;
}

/**
 * Stacked allocation bar plus five expandable bonus cards.
 *
 * Renders fixture-backed defaults (Orbit price) when no props are supplied.
 */
export function BonusBreakdown({ packageId, monthlyVolume }: BonusBreakdownProps) {
  const [expanded, setExpanded] = useState<BonusId | null>(null);
  const usingFixture = packageId === undefined && monthlyVolume === undefined;

  useEffect(() => {
    if (usingFixture) warnFixtureUsage('BonusBreakdown');
  }, [usingFixture]);

  const resolvedId: PackageId = isPackageId(packageId ?? '') ? (packageId as PackageId) : 'orbit';
  const volume = monthlyVolume !== undefined ? monthlyVolume : PACKAGES[resolvedId].price;
  const breakdown = calculateBonusBreakdown(volume);
  const volumeLabel =
    monthlyVolume !== undefined
      ? formatUsd(breakdown.volume)
      : `${PACKAGES[resolvedId].name} · ${formatUsd(PACKAGES[resolvedId].price)}`;

  const payoutPct = PAYOUT_CAP.mul(100);
  const networkPct = NETWORK_SHARE.mul(100);

  return (
    <section className="flex flex-col gap-4" data-testid="bonus-breakdown" aria-labelledby="bonus-breakdown-heading">
      <header className="flex flex-col gap-1">
        <h2
          id="bonus-breakdown-heading"
          className="text-sm font-extrabold uppercase tracking-wider text-[#d8e2ff]"
        >
          {STRINGS.heading}
        </h2>
        <p className="text-xs font-mono text-[#8c90a0]">{STRINGS.subheading}</p>
      </header>

      {/* Allocation of the 35% pool across the five bonus lines. */}
      <div className="p-4 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[11px] font-mono text-[#8c90a0]">
          <span>{STRINGS.valuedAgainst}</span>
          <span className="text-[#afc6ff] font-bold">{volumeLabel}</span>
        </div>

        <div
          className="flex w-full h-8 rounded-lg overflow-hidden border border-[#1E3559]"
          role="img"
          aria-label={STRINGS.barLabel}
        >
          {breakdown.lines.map((line) => (
            <div
              key={line.id}
              className="flex items-center justify-center min-w-0 transition-opacity hover:opacity-80"
              style={{ width: `${line.shareOfPool.toFixed(4)}%`, backgroundColor: BONUS_COLORS[line.id] }}
              title={`${line.name} — ${line.percent.toString()}%`}
            >
              <span className="text-[10px] sm:text-xs font-mono font-bold text-white/95 truncate px-1">
                {line.percent.toString()}%
              </span>
            </div>
          ))}
        </div>

        {/* Legend */}
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2" aria-label={STRINGS.legendLabel}>
          {breakdown.lines.map((line) => (
            <li key={line.id} className="flex items-start gap-2 min-w-0">
              <span
                className="mt-1 h-2.5 w-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: BONUS_COLORS[line.id] }}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block text-[11px] font-mono text-[#d8e2ff] truncate">{line.name}</span>
                <span className="block text-[11px] font-mono font-bold text-[#afc6ff]">
                  {line.percent.toString()}% · {formatUsd(line.amount)}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <p className="text-[11px] font-mono text-[#8c90a0] leading-relaxed">{STRINGS.poolNote}</p>
      </div>

      {/* The 35% cap in the context of a whole sale. */}
      <div className="p-4 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-3">
        <h3 className="text-[11px] font-mono uppercase tracking-wide text-[#8c90a0]">{STRINGS.capHeading}</h3>
        <div
          className="flex w-full h-6 rounded-lg overflow-hidden border border-[#1E3559]"
          role="img"
          aria-label={STRINGS.capBarLabel}
        >
          <div
            className="flex items-center justify-center bg-indigo-600"
            style={{ width: `${payoutPct.toString()}%` }}
          >
            <span className="text-[10px] font-mono font-bold text-white/95">{payoutPct.toString()}%</span>
          </div>
          <div
            className="flex items-center justify-center bg-[#1E3559]"
            style={{ width: `${networkPct.toString()}%` }}
          >
            <span className="text-[10px] font-mono font-bold text-[#afc6ff]">{networkPct.toString()}%</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono text-[#8c90a0]">
          <span>
            <span className="inline-block h-2 w-2 rounded-sm bg-indigo-600 mr-1.5" aria-hidden="true" />
            {STRINGS.capPayout} · {formatUsd(breakdown.totalPayout)}
          </span>
          <span>
            <span className="inline-block h-2 w-2 rounded-sm bg-[#1E3559] mr-1.5" aria-hidden="true" />
            {STRINGS.capNetwork} · {formatUsd(breakdown.networkShare)}
          </span>
        </div>
      </div>

      {/* Expandable detail cards. */}
      <div className="flex flex-col gap-2">
        <h3 className="text-[11px] font-mono uppercase tracking-wide text-[#8c90a0]">{STRINGS.detailsHeading}</h3>
        {BONUSES.map((bonus) => {
          const line = breakdown.lines.find((l) => l.id === bonus.id);
          const isOpen = expanded === bonus.id;
          const panelId = `bonus-panel-${bonus.id}`;

          return (
            <div key={bonus.id} className="rounded-2xl bg-[#112643]/70 border border-[#1E3559] overflow-hidden">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : bonus.id)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="w-full flex items-center gap-3 p-4 text-left cursor-pointer hover:bg-[#1E3559]/30 transition-colors"
              >
                <span
                  className="h-2.5 w-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: BONUS_COLORS[bonus.id] }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-[#d8e2ff] truncate">{bonus.name}</span>
                  <span className="block text-[11px] font-mono text-[#8c90a0]">
                    {line ? `${line.percent.toString()}% · ${formatUsd(line.amount)}` : ''}
                  </span>
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-[#8c90a0] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
                <span className="sr-only">{isOpen ? STRINGS.collapse : STRINGS.expand}</span>
              </button>

              {isOpen && (
                <div id={panelId} className="px-4 pb-4 flex flex-col gap-2 border-t border-[#1E3559]/60 pt-3">
                  <p className="text-xs text-[#d8e2ff] leading-relaxed">{bonus.mechanics}</p>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-mono uppercase tracking-wide text-[#8c90a0]">
                      {STRINGS.exampleLabel}
                    </span>
                    <span className="text-xs font-mono text-[#afc6ff]">{bonus.example}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-mono uppercase tracking-wide text-[#8c90a0]">
                      {STRINGS.gateLabel}
                    </span>
                    <span className="text-xs font-mono text-[#d8e2ff]">{bonus.gate ?? STRINGS.noGate}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Identical-rates disclosure. */}
      <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3">
        <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs font-mono text-emerald-300 leading-relaxed">{STRINGS.identicalRates}</p>
      </div>

      {/* Always-visible fee disclosure. */}
      <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
        <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs font-mono text-amber-300 leading-relaxed">{STRINGS.feeBanner}</p>
      </div>
    </section>
  );
}

export default BonusBreakdown;
