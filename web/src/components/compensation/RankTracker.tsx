'use client';

// Current rank, the four requirements for the next rank with progress, and the
// monthly-requalification warning.
//
// The red requalification banner sits ABOVE the progress bars deliberately: a
// user who reads only the top of the card must still see that rank is not
// permanent and that offline slots earn nothing.
import { useEffect } from 'react';
import { AlertTriangle, Award, Check } from 'lucide-react';
import Decimal from 'decimal.js';
import type { RankSnapshot, RequirementProgress } from '@/types/compensation-plan';
import { formatCount, formatUsd, getRankTable } from '@/lib/compensation/calc';
import { buildRankSnapshot, warnFixtureUsage } from '@/lib/compensation/fixtures';

/** English-locked UI + compliance copy (decision B2). */
const STRINGS = {
  heading: 'Rank',
  currentRankLabel: 'Current rank',
  maxRankLabel: 'Max rank',
  maxRankNote: 'Keystone is the highest rank. Monthly requalification still applies.',
  requalWarning: 'Rank requalifies MONTHLY. Drop offline slots, lose progress. Offline slots earn $0.',
  nextRankLabel: 'Next rank',
  requirementsHeading: 'Requirements',
  colRequirement: 'Requirement',
  colCurrent: 'Current',
  colRequired: 'Required',
  colProgress: 'Progress',
  ladderHeading: 'Rank ladder',
  colRank: 'Rank',
  colCustomers: 'Customers',
  colCV: 'Weak-Leg CV',
  colSlots: 'Slots',
  colBinaryCap: 'Binary Cap / wk',
  colShares: 'Shares',
  poolShares: 'pool shares',
  binaryCap: 'binary cap',
  none: '—',
  met: 'Met',
  fixtureNote: 'Showing example data. Live rank figures are not connected yet.',
  tableLabel: 'Requirements for the next rank',
  ladderLabel: 'All seven ranks and their requirements',
} as const;

export interface RankTrackerProps {
  /** Rank id the user currently holds, e.g. `'relay'`. */
  currentRank?: string;
  /** Personally enrolled customers. */
  personalSales?: number;
  /** Weaker-leg commissionable volume in USD. */
  weakLegCV?: number;
  /** Active slots in the organization. */
  activeSlots?: number;
  /** Weekly binary volume in USD. */
  weeklyBinaryVolume?: number;
}

/** Render one requirement value in its declared format, or an em dash when absent. */
function formatRequirement(value: Decimal | null, format: RequirementProgress['format']): string {
  if (value === null) return STRINGS.none;
  if (format === 'usd') return formatUsd(value, 0);
  if (format === 'usdPerWeek') return `${formatUsd(value, 0)}/wk`;
  return formatCount(value);
}

/**
 * Rank badge, next-rank progress, and the full seven-rank ladder.
 *
 * Falls back to fixture data (Relay, ~80–91% toward Beacon) when no props are
 * supplied, and warns once in development so mock values are never mistaken
 * for live ones.
 */
export function RankTracker({
  currentRank,
  personalSales,
  weakLegCV,
  activeSlots,
  weeklyBinaryVolume,
}: RankTrackerProps) {
  const snapshot: RankSnapshot = buildRankSnapshot(
    currentRank,
    personalSales,
    weakLegCV,
    activeSlots,
    weeklyBinaryVolume,
  );

  useEffect(() => {
    if (snapshot.isFixture) warnFixtureUsage('RankTracker');
  }, [snapshot.isFixture]);

  const { currentRank: rank, nextRank, requirements } = snapshot;
  const isMaxRank = nextRank === null;
  const ladder = getRankTable();

  return (
    <section className="flex flex-col gap-4" data-testid="rank-tracker" aria-labelledby="rank-tracker-heading">
      <h2
        id="rank-tracker-heading"
        className="text-sm font-extrabold uppercase tracking-wider text-[#d8e2ff] flex items-center gap-2"
      >
        <Award className="h-4 w-4 text-emerald-400" aria-hidden="true" /> {STRINGS.heading}
      </h2>

      {/* Current rank badge */}
      <div className="p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-3">
        <span className="text-[10px] font-mono uppercase tracking-wide text-[#8c90a0]">
          {STRINGS.currentRankLabel}
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-2xl sm:text-3xl font-extrabold text-emerald-400"
            data-testid="rank-badge"
          >
            {rank.name}
          </span>
          {isMaxRank && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs font-mono font-bold text-emerald-300">
              <Check className="h-3.5 w-3.5" aria-hidden="true" /> {STRINGS.maxRankLabel}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono text-[#8c90a0]">
          <span>
            {STRINGS.binaryCap}: <span className="text-[#afc6ff] font-bold">{formatUsd(rank.binaryCap, 0)}/wk</span>
          </span>
          <span>
            {STRINGS.poolShares}:{' '}
            <span className="text-[#afc6ff] font-bold">{rank.poolShares ?? STRINGS.none}</span>
          </span>
        </div>
      </div>

      {/* Requalification warning — above the progress bars by design. */}
      <div
        className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/40 flex items-start gap-3"
        role="alert"
        data-testid="requal-warning"
      >
        <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-sm font-bold text-rose-300 leading-relaxed">{STRINGS.requalWarning}</p>
      </div>

      {snapshot.isFixture && (
        <p className="text-[11px] font-mono text-[#8c90a0] px-1">{STRINGS.fixtureNote}</p>
      )}

      {/* Next-rank requirements + progress */}
      <div className="p-4 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[11px] font-mono uppercase tracking-wide text-[#8c90a0]">
            {STRINGS.requirementsHeading}
          </h3>
          {isMaxRank ? (
            <span className="text-xs font-mono text-emerald-400 font-bold">{STRINGS.maxRankNote}</span>
          ) : (
            <span className="text-xs font-mono text-[#8c90a0]">
              {STRINGS.nextRankLabel}:{' '}
              <span className="text-[#afc6ff] font-bold">{nextRank.name}</span>
            </span>
          )}
        </div>

        {isMaxRank ? (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
            <Check className="h-5 w-5 text-emerald-400 shrink-0" aria-hidden="true" />
            <p className="text-sm font-mono text-emerald-300">{STRINGS.maxRankNote}</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-left border-collapse" aria-label={STRINGS.tableLabel}>
              <thead>
                <tr className="text-[10px] font-mono uppercase tracking-wide text-[#8c90a0]">
                  <th scope="col" className="pb-2 pr-3 font-medium">{STRINGS.colRequirement}</th>
                  <th scope="col" className="pb-2 px-3 font-medium text-right">{STRINGS.colCurrent}</th>
                  <th scope="col" className="pb-2 px-3 font-medium text-right">{STRINGS.colRequired}</th>
                  <th scope="col" className="pb-2 pl-3 font-medium w-[38%] min-w-[120px]">{STRINGS.colProgress}</th>
                </tr>
              </thead>
              <tbody>
                {requirements.map((req) => {
                  const pct = req.progressPercent;
                  const pctLabel = pct === null ? STRINGS.none : `${pct.toFixed(0)}%`;
                  return (
                    <tr key={req.label} className="border-t border-[#1E3559]/60">
                      <th scope="row" className="py-3 pr-3 text-xs font-medium text-[#d8e2ff] whitespace-nowrap">
                        {req.label}
                      </th>
                      <td className="py-3 px-3 text-xs font-mono text-right text-[#d8e2ff] whitespace-nowrap">
                        {formatRequirement(req.current, req.format)}
                      </td>
                      <td className="py-3 px-3 text-xs font-mono text-right text-[#8c90a0] whitespace-nowrap">
                        {formatRequirement(req.required, req.format)}
                      </td>
                      <td className="py-3 pl-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="flex-1 h-2 rounded-full bg-[#1E3559] overflow-hidden min-w-[48px]"
                            role="progressbar"
                            aria-valuenow={pct === null ? 0 : pct.toDP(0, Decimal.ROUND_HALF_UP).toNumber()}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`${req.label} progress toward ${nextRank.name}`}
                          >
                            <div
                              className={`h-full rounded-full transition-all ${
                                req.met ? 'bg-emerald-500' : 'bg-indigo-600'
                              }`}
                              style={{ width: `${pct === null ? 0 : pct.toFixed(2)}%` }}
                            />
                          </div>
                          <span
                            className={`text-[11px] font-mono font-bold w-11 text-right shrink-0 ${
                              req.met ? 'text-emerald-400' : 'text-[#afc6ff]'
                            }`}
                          >
                            {req.met ? STRINGS.met : pctLabel}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Full ladder */}
      <div className="p-4 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-3">
        <h3 className="text-[11px] font-mono uppercase tracking-wide text-[#8c90a0]">{STRINGS.ladderHeading}</h3>
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-left border-collapse min-w-[520px]" aria-label={STRINGS.ladderLabel}>
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-wide text-[#8c90a0]">
                <th scope="col" className="pb-2 pr-3 font-medium">{STRINGS.colRank}</th>
                <th scope="col" className="pb-2 px-3 font-medium text-right">{STRINGS.colCustomers}</th>
                <th scope="col" className="pb-2 px-3 font-medium text-right">{STRINGS.colCV}</th>
                <th scope="col" className="pb-2 px-3 font-medium text-right">{STRINGS.colSlots}</th>
                <th scope="col" className="pb-2 px-3 font-medium text-right">{STRINGS.colBinaryCap}</th>
                <th scope="col" className="pb-2 pl-3 font-medium text-right">{STRINGS.colShares}</th>
              </tr>
            </thead>
            <tbody>
              {ladder.map((r) => {
                const isCurrent = r.id === rank.id;
                return (
                  <tr
                    key={r.id}
                    className={`border-t border-[#1E3559]/60 ${isCurrent ? 'bg-emerald-500/10' : ''}`}
                    aria-current={isCurrent ? 'true' : undefined}
                  >
                    <th
                      scope="row"
                      className={`py-2.5 pr-3 text-xs font-bold whitespace-nowrap ${
                        isCurrent ? 'text-emerald-400' : 'text-[#d8e2ff]'
                      }`}
                    >
                      {r.name}
                    </th>
                    <td className="py-2.5 px-3 text-xs font-mono text-right text-[#d8e2ff]">
                      {r.personalCustomers}
                    </td>
                    <td className="py-2.5 px-3 text-xs font-mono text-right text-[#d8e2ff]">
                      {r.weakLegCV ? formatUsd(r.weakLegCV, 0) : STRINGS.none}
                    </td>
                    <td className="py-2.5 px-3 text-xs font-mono text-right text-[#d8e2ff]">
                      {r.activeSlots !== null ? formatCount(new Decimal(r.activeSlots)) : STRINGS.none}
                    </td>
                    <td className="py-2.5 px-3 text-xs font-mono text-right text-[#d8e2ff]">
                      {formatUsd(r.binaryCap, 0)}
                    </td>
                    <td className="py-2.5 pl-3 text-xs font-mono text-right text-[#d8e2ff]">
                      {r.poolShares ?? STRINGS.none}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default RankTracker;
