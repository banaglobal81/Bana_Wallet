'use client';

// Compensation plan overview. Lives in the (site) route group, so it inherits
// the app shell (sidebar / bottom nav) and the session gate in middleware.ts —
// this page is for signed-in users, not prospects.
//
// D1 build: every figure here is either a frozen plan constant or fixture data.
// No API is called. When the compensation endpoints exist, build a RankSnapshot
// from live values and pass it to RankTracker; nothing else changes.
//
// Not linked from the sidebar on purpose — the underlying data is mock and the
// plan copy is still pending compliance review. Reach it directly at
// /<locale>/compensation until both are settled.
import RankTracker from '@/components/compensation/RankTracker';
import BonusBreakdown from '@/components/compensation/BonusBreakdown';
import EarningsCalculator from '@/components/compensation/EarningsCalculator';

/** English-locked page chrome + compliance copy (decision B2). */
const STRINGS = {
  title: 'Compensation Plan',
  subtitle: 'Rank requirements, bonus structure, and published rates.',
  notInvestment:
    'This is not an investment. Packages are a purchase, not a security. ' +
    'Earnings depend on your own sales performance and node uptime, and are not guaranteed.',
  preview: 'Preview — rank figures are example data and are not connected to your account yet.',
} as const;

/** Compensation plan overview page. Read-only; renders plan constants and fixtures. */
export default function CompensationPage() {
  return (
    <div className="bana-page flex-1 min-h-full bg-[#06132a] text-[#d8e2ff] p-4 sm:p-6 lg:p-8 flex flex-col gap-6 overflow-y-auto">
      <header className="pb-2 border-b border-[#1E3559]/40 flex flex-col gap-1">
        <h1
          data-testid="compensation-title"
          className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white"
        >
          {STRINGS.title}
        </h1>
        <p className="text-xs sm:text-sm font-mono text-[#8c90a0]">{STRINGS.subtitle}</p>
      </header>

      {/* Mandatory top-level disclosure — first thing under the title, not a footer. */}
      <div
        className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/40"
        role="alert"
        data-testid="not-investment-banner"
      >
        <p className="text-sm font-bold text-rose-300 leading-relaxed">{STRINGS.notInvestment}</p>
      </div>

      <p className="text-[11px] font-mono text-[#8c90a0]">{STRINGS.preview}</p>

      {/* Rank and bonus structure sit side by side on wide screens; the rate
          reference spans full width because its table is the widest element. */}
      <div className="grid gap-6 xl:grid-cols-2 items-start">
        <RankTracker />
        <BonusBreakdown />
      </div>

      <EarningsCalculator />
    </div>
  );
}
