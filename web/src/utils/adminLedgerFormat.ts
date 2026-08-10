// admin-staking-debt-visibility-frd.md §4.3 (N-1..N-5) and §3.4 (INV-1/2/3).
//
// Pure, framework-free helpers for rendering staking-liability decimal
// strings and detecting ledger-integrity violations. No Number()/parseFloat()
// /toLocaleString() on money strings anywhere in this file (CLAUDE.md rule 2)
// — comparisons use decimal.js, display formatting is string-only.

import Decimal from 'decimal.js';
import type { AdminStakingStat } from './adminApi';

/** True iff `raw` is a decimal string whose numeric value is exactly zero (handles "0", "0.0", "-0.00000000", etc). String-only check — no Number()/parseFloat(). */
export function isZeroAmount(raw: string): boolean {
  const digits = raw.replace(/[-.]/g, '');
  return /^0*$/.test(digits);
}

export interface FormattedLedgerAmount {
  /** What to render next to the coin symbol. */
  display: string;
  /** True if the fractional part was truncated past 8 digits (N-2/N-3) — caller should append a `title` with the raw string. */
  truncated: boolean;
}

/**
 * N-2/N-3/N-4: comma-group the integer part, truncate (never round) the
 * fractional part at 8 digits with a trailing "…", and collapse an exact
 * zero to "0" (never "0.00000000"). Pure string manipulation — the input is
 * already a canonical decimal string from the server, so no locale/exponent
 * handling is needed.
 */
export function formatLedgerAmount(raw: string): FormattedLedgerAmount {
  if (isZeroAmount(raw)) return { display: '0', truncated: false };

  const neg = raw.startsWith('-');
  const unsigned = neg ? raw.slice(1) : raw;
  const [intPartRaw, fracPart = ''] = unsigned.split('.');
  const intPart = intPartRaw === '' ? '0' : intPartRaw;
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  const truncated = fracPart.length > 8;
  const frac = truncated ? fracPart.slice(0, 8) : fracPart;
  const fracStr = frac ? `.${frac}${truncated ? '…' : ''}` : '';

  return { display: `${neg ? '-' : ''}${withCommas}${fracStr}`, truncated };
}

export type LiabilityIncident =
  | { kind: 'paidStatus'; coin: string; n: number }
  | { kind: 'negative'; coin: string }
  | { kind: 'grantExceeds'; coin: string };

function isNegative(raw: string): boolean {
  try {
    return new Decimal(raw).isNegative() && !new Decimal(raw).isZero();
  } catch {
    return false;
  }
}

function isGreater(a: string, b: string): boolean {
  try {
    return new Decimal(a).gt(new Decimal(b));
  } catch {
    return false;
  }
}

/**
 * INV-1/2/3 watchdog (§3.4). Returns one incident per coin per violated
 * invariant. Empty array means every invariant currently holds — this is an
 * OBSERVED fact, not a guarantee, which is exactly why it's checked on every
 * fetch instead of assumed.
 */
export function detectLiabilityIncidents(stats: AdminStakingStat[]): LiabilityIncident[] {
  const incidents: LiabilityIncident[] = [];
  for (const s of stats) {
    // INV-1: StakePositionStatus.PAID is never assigned by any code path.
    if (s.settledStatusCount > 0) incidents.push({ kind: 'paidStatus', coin: s.coin, n: s.settledStatusCount });
    // INV-2: unpaidInterest must never be negative.
    if (isNegative(s.unpaidInterest)) incidents.push({ kind: 'negative', coin: s.coin });
    // INV-3: grantedActivePrincipal is a subset of activePrincipal, never larger.
    if (isGreater(s.grantedActivePrincipal, s.activePrincipal)) incidents.push({ kind: 'grantExceeds', coin: s.coin });
  }
  return incidents;
}
