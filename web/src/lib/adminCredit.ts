import 'server-only';

// rev05 §4A (Q-M7) / rev05a (T-16 E-1~E-5 rulings) — shared helpers for the admin
// balance-adjustment surface (ADMIN_ADJUSTMENT_CREDIT/DEBIT). Consumed by the three
// routes under web/src/app/api/admin/credit/ (T-17). This is the ONLY route family
// allowed to write those two reason codes — see localLedger.ts §4.2/§4.7 for the
// ledger-side gating this file's callers must go through (AC-15/AC-16/AC-7/AC-11).
//
// docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md §4A
// docs/specs/staking-yield-system-v2-prd-rev05a-admin-credit-rulings.md
// docs/specs/staking-yield-system-v2-design-t16-admin-credit-frd.md
//
// CLAUDE.md rule 2: all amount arithmetic uses decimal.js — never Number()/parseFloat().

import Decimal from 'decimal.js';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getPlatformSettings } from '@/lib/platformSettings';
import { getAdminCreditRollingUsage, getCoinAdminAdjustmentNet } from '@/lib/localLedger';

// ---------------------------------------------------------------------------
// AC-1 — the four approved reason types. Never widen this without a PRD ruling —
// this set is a deliberate scope narrowing (rev05 §4A.1), not an implementation detail.
// ---------------------------------------------------------------------------

export const ADMIN_ADJUSTMENT_REASON_TYPES = [
  'E2E_VERIFICATION',
  'RECONCILIATION_FIX',
  'INCIDENT_COMPENSATION',
  'OTHER',
] as const;

export type AdminAdjustmentReasonTypeValue = (typeof ADMIN_ADJUSTMENT_REASON_TYPES)[number];

export function isAdminAdjustmentReasonType(v: unknown): v is AdminAdjustmentReasonTypeValue {
  return typeof v === 'string' && (ADMIN_ADJUSTMENT_REASON_TYPES as readonly string[]).includes(v);
}

// rev05a §4.3 (T-16 §4.3) — `OTHER` needs 20 codepoints, the other three need 4
// (rev05 AC-4 only mandated the 20 for OTHER; T-16 adds the 4-codepoint floor for
// the rest so "." doesn't pass as a description for any type).
export function minDescriptionCodepoints(reasonType: AdminAdjustmentReasonTypeValue): number {
  return reasonType === 'OTHER' ? 20 : 4;
}

/**
 * T-16 §4.3 — trim + collapse internal whitespace, then measure in Unicode
 * codepoints (Array.from), not UTF-16 code units — a UTF-16 count under- or
 * over-counts CJK/emoji, letting a shorter-than-intended description through.
 */
export function normalizeAndCountDescription(raw: string): { normalized: string; length: number } {
  const normalized = String(raw ?? '').trim().replace(/\s+/g, ' ');
  return { normalized, length: Array.from(normalized).length };
}

/** DC-4 — the stored adjustmentReason is `"<machine token>: <description>"`, never a locale label. */
export function buildAdjustmentReason(reasonType: AdminAdjustmentReasonTypeValue, normalizedDescription: string): string {
  return `${reasonType}: ${normalizedDescription}`;
}

// ---------------------------------------------------------------------------
// Target user lookup (AC-12 — one email, one match, no search list)
// ---------------------------------------------------------------------------

export function normalizeEmail(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase();
}

export async function findAdminCreditTargetUser(
  email: string,
): Promise<{ id: string; email: string } | null> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
  return user ? { id: user.id, email: user.email } : null;
}

// ---------------------------------------------------------------------------
// DC-1 — coins[] (LOCAL-authority only, for the picker / V7 route-level constraint)
// ---------------------------------------------------------------------------

export interface AdminCreditCoinOption {
  symbol: string;
  balanceAuthority: 'HUB' | 'LOCAL';
  authorityAlertStage: 'CLEAR' | 'T1_WARNING' | 'T2_HALTED';
}

export async function listLocalAdminCreditCoins(): Promise<AdminCreditCoinOption[]> {
  return prisma.managedCoin.findMany({
    where: { balanceAuthority: 'LOCAL' },
    select: { symbol: true, balanceAuthority: true, authorityAlertStage: true },
    orderBy: { symbol: 'asc' },
  });
}

// ---------------------------------------------------------------------------
// DC-5 — the three limit rows. `remaining` here is the SAME figure the POST route
// uses to accept/reject (computeAdminCreditLimitRows is the single source both the
// context display and the POST enforcement call into) — the client never derives it.
// ---------------------------------------------------------------------------

export type AdminCreditLimitKey = 'perTx' | 'perDay' | 'cumulative';

export interface AdminCreditLimitRow {
  key: AdminCreditLimitKey;
  /** null = "not configured" — AC-6's reversed convention: null means BLOCKED, not unlimited. */
  limit: string | null;
  /** null = "not computed yet" (no coin selected) or "failed to compute" — never "0". */
  used: string | null;
  /** null whenever limit or used is null. */
  remaining: string | null;
}

export interface PlatformCreditLimitSettings {
  adminCreditMaxPerTx: string | null;
  adminCreditMaxPerDay: string | null;
  adminCreditCumulativeCap: string | null;
}

/**
 * Computes all three limit rows for one admin + (optional) coin. Pass `tx` from the
 * POST route's transaction (post-lock) so usage figures are read under the same
 * ManagedCoin row lock the write itself takes (AC-7) — the context/target GET routes
 * call this without a `tx` (best-effort display, not an enforcement decision).
 */
export async function computeAdminCreditLimitRows(opts: {
  adminId: string;
  coin: string | null;
  settings: PlatformCreditLimitSettings;
  tx?: Prisma.TransactionClient;
}): Promise<AdminCreditLimitRow[]> {
  const { adminId, coin, settings, tx } = opts;

  const perTx: AdminCreditLimitRow = {
    key: 'perTx',
    limit: settings.adminCreditMaxPerTx,
    used: null,
    remaining: null, // per-transaction — there is no "usage" axis, only pass/fail against `limit`.
  };

  let perDay: AdminCreditLimitRow = { key: 'perDay', limit: settings.adminCreditMaxPerDay, used: null, remaining: null };
  let cumulative: AdminCreditLimitRow = {
    key: 'cumulative',
    limit: settings.adminCreditCumulativeCap,
    used: null,
    remaining: null,
  };

  if (coin) {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const used = await getAdminCreditRollingUsage(adminId, coin, since, { tx });
      perDay = {
        ...perDay,
        used,
        remaining:
          settings.adminCreditMaxPerDay != null ? new Decimal(settings.adminCreditMaxPerDay).minus(used).toFixed() : null,
      };
    } catch {
      perDay = { ...perDay, used: null, remaining: null };
    }

    try {
      const net = await getCoinAdminAdjustmentNet(coin, { tx });
      cumulative = {
        ...cumulative,
        used: net,
        remaining:
          settings.adminCreditCumulativeCap != null
            ? new Decimal(settings.adminCreditCumulativeCap).minus(net).toFixed()
            : null,
      };
    } catch {
      cumulative = { ...cumulative, used: null, remaining: null };
    }
  }

  return [perTx, perDay, cumulative];
}

export { getPlatformSettings };
