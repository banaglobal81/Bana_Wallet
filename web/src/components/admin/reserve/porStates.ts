// A-8 §6.1.1 — PoR-1″ 8-state display derivation + A-11 §6 color/token mapping.
// Pure, framework-free — no fetch/DOM here, so it is unit-testable without a
// server or a DB (mirrors the harness split used elsewhere in this codebase).
//
// rev04 replaced the informal "UNCONFIGURED" concept with a real server enum
// value (`ReserveVerificationResult.NO_RESERVE_BASIS`, PoR-G1) — this module
// maps that server value to the `UNCONFIGURED` *display* state name the task
// and A-8/A-11 use, so the 8 requested display states are exactly:
// PASS / FAIL / NEVER_RUN / QUERY_FAILED / STALE / INCOMPLETE / UNCONFIGURED /
// UNAVAILABLE.

export type PorServerResult = 'PASS' | 'FAIL' | 'INCOMPLETE' | 'QUERY_FAILED' | 'NO_RESERVE_BASIS';

export type PorDisplayState =
  | 'PASS'
  | 'FAIL'
  | 'NEVER_RUN'
  | 'QUERY_FAILED'
  | 'STALE'
  | 'INCOMPLETE'
  | 'UNCONFIGURED'
  | 'UNAVAILABLE';

export interface PorStateInput {
  /** Section-level fetch outcome (DC-1 discriminated union). */
  sectionStatus: 'OK' | 'UNAVAILABLE';
  /** Most recent ReserveVerificationRun for this coin, or null if none exists yet. */
  latestRun: { result: PorServerResult } | null;
  /** Server-computed staleness (DC-4 — never derived client-side from a timestamp). */
  isStale: boolean;
}

/**
 * A-8 §6.1.1 priority order, top to bottom, first match wins:
 * UNAVAILABLE (section fetch itself failed) > FAIL > NEVER_RUN > QUERY_FAILED
 * > STALE > INCOMPLETE > UNCONFIGURED (NO_RESERVE_BASIS) > PASS.
 *
 * PR-1/PR-2: never renders the raw 5-value server `result` directly — always
 * goes through this derivation, and never returns PASS for any of the other
 * seven states (in particular UNCONFIGURED must never collapse into PASS).
 */
export function derivePorDisplayState(input: PorStateInput): PorDisplayState {
  if (input.sectionStatus === 'UNAVAILABLE') return 'UNAVAILABLE';
  if (!input.latestRun) return 'NEVER_RUN';
  if (input.latestRun.result === 'FAIL') return 'FAIL';
  if (input.latestRun.result === 'QUERY_FAILED') return 'QUERY_FAILED';
  if (input.isStale) return 'STALE';
  if (input.latestRun.result === 'INCOMPLETE') return 'INCOMPLETE';
  if (input.latestRun.result === 'NO_RESERVE_BASIS') return 'UNCONFIGURED';
  return 'PASS';
}

// A-11 §6.1/§6.3 — exact color tokens. UNCONFIGURED intentionally uses violet
// (Tailwind's violet-400 = #a78bfa / violet-600 = #7c3aed are byte-identical
// to A-11's literal hex values) so it can never be mistaken for PASS (emerald).
export interface PorStateStyle {
  text: string;
  bg: string;
  border: string;
}

export const POR_STATE_STYLE: Record<PorDisplayState, PorStateStyle> = {
  PASS: { text: 'text-emerald-400', bg: 'bg-emerald-500/20', border: 'border-emerald-500/40' },
  FAIL: { text: 'text-rose-400', bg: 'bg-rose-500/20', border: 'border-rose-500/40' },
  NEVER_RUN: { text: 'text-[#8c90a0]', bg: 'bg-[#8c90a0]/20', border: 'border-[#8c90a0]/40' },
  QUERY_FAILED: { text: 'text-[#8c90a0]', bg: 'bg-[#8c90a0]/20', border: 'border-[#8c90a0]/40' },
  STALE: { text: 'text-amber-400', bg: 'bg-amber-500/20', border: 'border-amber-500/40' },
  INCOMPLETE: { text: 'text-amber-400', bg: 'bg-amber-500/20', border: 'border-amber-500/40' },
  // A-11 §6.2 — deliberately NOT emerald. Purple/violet is the one color this
  // panel never uses for anything else.
  UNCONFIGURED: { text: 'text-violet-400', bg: 'bg-violet-500/20', border: 'border-violet-500/40' },
  UNAVAILABLE: { text: 'text-[#8c90a0]', bg: 'bg-[#8c90a0]/20', border: 'border-[#8c90a0]/40' },
};

// adminReserve.por.state.<key>.{title,body} message keys (web/messages/*.json).
export const POR_STATE_MESSAGE_KEY: Record<PorDisplayState, string> = {
  PASS: 'pass',
  FAIL: 'fail',
  NEVER_RUN: 'neverRun',
  QUERY_FAILED: 'queryFailed',
  STALE: 'stale',
  INCOMPLETE: 'incomplete',
  UNCONFIGURED: 'unconfigured',
  UNAVAILABLE: 'unavailable',
};

/** rev04 §1.3 — the 5 componentRole values (A-8 §5 DC-6 addendum). */
export type PorComponentRole =
  | 'ADDITIVE'
  | 'SUBSET_OF_LOCAL_BALANCE'
  | 'PROGRAM_COMMITMENT'
  | 'TIMING_ADJUSTMENT';
