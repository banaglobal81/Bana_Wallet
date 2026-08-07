'use client';

// RATE REFERENCE — deliberately NOT a calculator.
//
// There are no input fields and no user-driven math. The table is static and
// always shows the same fixed example (2 packages/month), because a tool that
// projects "what if I sell 50 a month" produces an income claim the moment its
// output is screenshotted.
//
// USD and BANA are shown in SEPARATE columns and are never summed: BANA has no
// official price, so a combined total would assert one. Do not add a total column.
import { AlertTriangle, Info } from 'lucide-react';
import {
  calculateFastStart,
  calculateMonthlyEmission,
  formatBana,
  formatUsd,
} from '@/lib/compensation/calc';
import { BONUSES, DAYS_PER_MONTH, PACKAGES, PACKAGE_IDS, REFERENCE_QUANTITY } from '@/lib/compensation/plan';

/** English-locked UI + compliance copy (decision B2). */
const STRINGS = {
  heading: 'Rate Reference — Illustrative Example',
  subtext: `If you sell ${REFERENCE_QUANTITY} packages per month at these rates:`,
  tableLabel: 'Fast Start rate and monthly emission per package, at two sales per month',
  colPackage: 'Package',
  colPrice: 'Price',
  colQty: 'Qty',
  colFastStart: 'Monthly Fast Start (USD)',
  colEmission: 'Monthly Emission (BANA tokens)',
  caption: 'BANA has no official price; these two columns cannot be added.',
  formulaLabel: 'Emission formula',
  disclaimer:
    'Illustrative only. Shows emissions. Fee income $0 initially, grows with network adoption. ' +
    'Earnings depend on your sales performance, node uptime, and network usage. Not guaranteed.',
  ratesHeading: 'Bonus rates',
  ratesNote: 'Rates are identical on all three packages.',
} as const;

/**
 * Static rate-reference table for the three packages.
 *
 * Read-only by design — it accepts no props, exposes no inputs, and always
 * renders the same fixed two-sales-per-month example.
 */
export function EarningsCalculator() {
  const rows = PACKAGE_IDS.map((id) => {
    const pkg = PACKAGES[id];
    const fastStart = calculateFastStart(id, REFERENCE_QUANTITY);
    const emission = calculateMonthlyEmission(id, REFERENCE_QUANTITY, DAYS_PER_MONTH);
    return {
      id,
      name: pkg.name,
      price: pkg.price,
      fastStart,
      emission,
      // Printed formula must reproduce the printed value exactly. dailyBana
      // already includes slots, so slots never appear here.
      formula: `${pkg.dailyBana.toString()} BANA/day × ${DAYS_PER_MONTH} days × ${REFERENCE_QUANTITY} packages = ${emission.toFixed(2)} BANA`,
    };
  });

  const rateSummary = BONUSES.map((b) => `${b.rate.mul(100).toString()}% (${b.name})`).join(' + ');

  return (
    <section
      className="flex flex-col gap-4"
      data-testid="earnings-calculator"
      aria-labelledby="rate-reference-heading"
    >
      <header className="flex flex-col gap-1">
        <h2
          id="rate-reference-heading"
          className="text-sm font-extrabold uppercase tracking-wider text-[#d8e2ff]"
        >
          {STRINGS.heading}
        </h2>
        <p className="text-xs font-mono text-[#8c90a0]">{STRINGS.subtext}</p>
      </header>

      <div className="p-4 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-3">
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-left border-collapse min-w-[560px]" aria-label={STRINGS.tableLabel}>
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-wide text-[#8c90a0]">
                <th scope="col" className="pb-2 pr-3 font-medium">{STRINGS.colPackage}</th>
                <th scope="col" className="pb-2 px-3 font-medium text-right">{STRINGS.colPrice}</th>
                <th scope="col" className="pb-2 px-3 font-medium text-right">{STRINGS.colQty}</th>
                <th scope="col" className="pb-2 px-3 font-medium text-right text-indigo-300">
                  {STRINGS.colFastStart}
                </th>
                <th scope="col" className="pb-2 pl-3 font-medium text-right text-amber-300">
                  {STRINGS.colEmission}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[#1E3559]/60 align-top">
                  <th scope="row" className="py-3 pr-3 text-xs font-bold text-[#d8e2ff] whitespace-nowrap">
                    {row.name}
                  </th>
                  <td className="py-3 px-3 text-xs font-mono text-right text-[#d8e2ff] whitespace-nowrap">
                    {formatUsd(row.price, 0)}
                  </td>
                  <td className="py-3 px-3 text-xs font-mono text-right text-[#8c90a0]">
                    {REFERENCE_QUANTITY}
                  </td>
                  <td className="py-3 px-3 text-xs font-mono font-bold text-right text-indigo-300 whitespace-nowrap">
                    {formatUsd(row.fastStart)}
                  </td>
                  <td className="py-3 pl-3 text-right whitespace-nowrap">
                    <span className="block text-xs font-mono font-bold text-amber-300">
                      {formatBana(row.emission)}
                    </span>
                    <span className="block text-[10px] font-mono text-[#8c90a0] mt-0.5">{row.formula}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] font-mono text-[#8c90a0] leading-relaxed border-t border-[#1E3559]/60 pt-3">
          {STRINGS.caption}
        </p>
      </div>

      {/* Mandatory disclosure. */}
      <div
        className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/40 flex items-start gap-3"
        role="alert"
        data-testid="earnings-disclaimer"
      >
        <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs font-mono text-rose-300 leading-relaxed">{STRINGS.disclaimer}</p>
      </div>

      {/* Rate summary. */}
      <div className="p-4 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-start gap-3">
        <Info className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-wide text-sky-400/80">{STRINGS.ratesHeading}</p>
          <p className="text-xs font-mono text-sky-300 leading-relaxed break-words">{rateSummary}.</p>
          <p className="text-[11px] font-mono text-sky-300/70">{STRINGS.ratesNote}</p>
        </div>
      </div>
    </section>
  );
}

export default EarningsCalculator;
