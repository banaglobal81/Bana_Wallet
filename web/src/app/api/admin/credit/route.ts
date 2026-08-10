export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/admin/credit — the one route allowed to write ADMIN_ADJUSTMENT_CREDIT /
// ADMIN_ADJUSTMENT_DEBIT entries (rev05 §4A, Q-M7). Every safeguard below traces back
// to a specific acceptance criterion — do not remove one without the corresponding
// PRD ruling changing:
//
//   AC-5-1  session-derived identity only — createdByAdminId/createdByEmail/
//           adjustmentReason/userId are FORBIDDEN in the request body (400, not ignored)
//   AC-13′  adminCreditEnabled kill switch — 403 ADMIN_CREDIT_DISABLED
//   AC-3    server re-verifies the typed confirmation (email + amount) independent of
//           the client's own button-disabled state
//   AC-12   one email, one match — no bulk/list targeting
//   AC-7    ManagedCoin row FOR UPDATE, taken before AC-15/AC-16/AC-6 are evaluated —
//           serializes concurrent admin-credit requests AND authority transitions
//   AC-15   coin must be balanceAuthority='LOCAL', re-checked under that lock (TOCTOU)
//   AC-16   T2_HALTED coins: CREDIT restricted to reasonType=RECONCILIATION_FIX;
//           DEBIT is never reason-restricted
//   AC-6    three independent caps (per-tx / per-admin-per-24h / cumulative net),
//           CREDIT only — null means BLOCKED, not unlimited
//   AC-17   idempotencyKey required; a reused key only replays on an exact parameter
//           match (userId/coin/amount/direction/admin) — any mismatch is a 409
//           conflict, never a silent "success"
//   AC-11   DEBIT is checked against `available` (balance − Σ ACTIVE holds), not just
//           balance — enforced inside localLedger.ts's debitLocalLedger (N-48)
//
// docs/specs/staking-yield-system-v2-prd-rev05-creation-path-cutover.md §4A
// docs/specs/staking-yield-system-v2-prd-rev05a-admin-credit-rulings.md
// docs/specs/staking-yield-system-v2-design-t16-admin-credit-frd.md §5 (DC-1~DC-9)

import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/session';
import {
  creditLocalLedger,
  debitLocalLedger,
  evaluateAdminAdjustmentGate,
  isAdminAdjustmentBlocked,
  lockManagedCoinForAdminAdjustment,
  LocalLedgerIdempotencyConflictError,
  getUserCoinBalance,
  getCoinAdminAdjustmentNet,
  getLocalLedgerBalanceTotal,
  type AdminAdjustmentDirection,
} from '@/lib/localLedger';
import {
  ADMIN_ADJUSTMENT_REASON_TYPES,
  isAdminAdjustmentReasonType,
  minDescriptionCodepoints,
  normalizeAndCountDescription,
  buildAdjustmentReason,
  normalizeEmail,
  findAdminCreditTargetUser,
  computeAdminCreditLimitRows,
  getPlatformSettings,
} from '@/lib/adminCredit';

// AC-5-1 / DC-3 — a client that sends any of these gets a hard 400, never a silent
// ignore (silently dropping them would leave the caller thinking its value was used).
const FORBIDDEN_BODY_FIELDS = ['createdByAdminId', 'createdByEmail', 'adjustmentReason', 'userId'] as const;

function errRes(code: string, message: string, status: number, detail?: Record<string, unknown> | null) {
  return NextResponse.json({ ok: false, code, message, detail: detail ?? undefined }, { status });
}

/** Thrown inside the transaction for every rejection that has an HTTP-shaped answer. */
class AdminCreditRejection extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail?: Record<string, unknown> | null;
  constructor(code: string, message: string, status: number, detail?: Record<string, unknown> | null) {
    super(message);
    this.name = 'AdminCreditRejection';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  let admin: { id?: string; email?: string };
  try {
    admin = (await requireAdmin()) as { id?: string; email?: string };
  } catch (e) {
    const error = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status ?? 500 });
  }
  if (!admin.id || !admin.email) {
    // Defensive — requireAdmin's session shape always carries both today, but never
    // fall back to a client-supplied identity if it somehow doesn't (CLAUDE.md rule 8).
    return errRes('ADMIN_CREDIT_SESSION_INVALID', 'Your session is missing an admin id/email — sign in again.', 401);
  }
  const adminId = admin.id;
  const adminEmail = admin.email;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return errRes('ADMIN_CREDIT_BODY_INVALID', 'Request body must be JSON.', 400);
  }

  for (const field of FORBIDDEN_BODY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      return errRes('ADMIN_CREDIT_FORBIDDEN_FIELD', `"${field}" is not accepted in the request body.`, 400, { field });
    }
  }

  const direction = body.direction as AdminAdjustmentDirection;
  if (direction !== 'CREDIT' && direction !== 'DEBIT') {
    return errRes('ADMIN_CREDIT_DIRECTION_INVALID', 'direction must be "CREDIT" or "DEBIT".', 400);
  }

  const reasonType = body.reasonType;
  if (!isAdminAdjustmentReasonType(reasonType)) {
    return errRes(
      'ADMIN_CREDIT_REASON_INVALID',
      `reasonType must be one of ${ADMIN_ADJUSTMENT_REASON_TYPES.join(', ')}.`,
      400,
    );
  }

  const { normalized: description, length: descriptionLength } = normalizeAndCountDescription(
    String(body.description ?? ''),
  );
  const minLen = minDescriptionCodepoints(reasonType);
  if (descriptionLength < minLen) {
    return errRes('ADMIN_CREDIT_DESCRIPTION_TOO_SHORT', `Description must be at least ${minLen} characters.`, 400, {
      min: minLen,
    });
  }

  const email = normalizeEmail(body.email);
  if (!email || !email.includes('@')) {
    return errRes('ADMIN_CREDIT_EMAIL_INVALID', 'Enter a valid email address.', 400);
  }

  const coin = String(body.coin ?? '').trim().toUpperCase();
  if (!coin) {
    return errRes('ADMIN_CREDIT_COIN_REQUIRED', 'Select a coin.', 400);
  }

  let amount: Decimal;
  try {
    amount = new Decimal(String(body.amount ?? ''));
  } catch {
    return errRes('ADMIN_CREDIT_AMOUNT_INVALID', 'Enter a valid amount greater than zero.', 400);
  }
  if (!amount.isFinite() || amount.lte(0)) {
    return errRes('ADMIN_CREDIT_AMOUNT_INVALID', 'Enter a valid amount greater than zero.', 400);
  }

  const idempotencyKey = String(body.idempotencyKey ?? '').trim();
  if (!idempotencyKey) {
    return errRes('ADMIN_CREDIT_IDEMPOTENCY_KEY_REQUIRED', 'idempotencyKey is required.', 400);
  }

  // AC-3 — server re-validates the typed confirmation. `confirmEmail` compares
  // trim+lowercase (same rule as `email` above); `confirmAmount` compares as Decimal
  // (T-16 J-4 — "100" must equal "100.00"). Never trust the client's own disabled
  // state as the control.
  const confirmEmail = normalizeEmail(body.confirmEmail);
  let confirmAmountMatches = false;
  try {
    confirmAmountMatches = new Decimal(String(body.confirmAmount ?? '')).eq(amount);
  } catch {
    confirmAmountMatches = false;
  }
  if (confirmEmail !== email || !confirmAmountMatches) {
    return errRes('ADMIN_CREDIT_CONFIRMATION_MISMATCH', 'Confirmation email/amount do not match the request.', 400);
  }

  // AC-13′ — kill switch, checked before any DB write and before the target lookup.
  const settings = await getPlatformSettings();
  if (!settings.adminCreditEnabled) {
    return errRes('ADMIN_CREDIT_DISABLED', 'Balance adjustment is off. Turn it on in Platform Settings.', 403);
  }

  // AC-12 — one email, one exact match. Never created here (this screen creates no accounts).
  const targetUser = await findAdminCreditTargetUser(email);
  if (!targetUser) {
    return errRes(
      'ADMIN_CREDIT_USER_NOT_FOUND',
      `No user found with email ${email}. This screen does not create accounts.`,
      400,
    );
  }

  const adjustmentReason = buildAdjustmentReason(reasonType, description);
  const reasonCode = direction === 'CREDIT' ? ('ADMIN_ADJUSTMENT_CREDIT' as const) : ('ADMIN_ADJUSTMENT_DEBIT' as const);
  // AC-5 requirement 2(b) — best-effort, never trusted for authorization (only
  // recorded in the audit detail string).
  const requestIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // AC-7 — lock ManagedCoin FIRST. Every subsequent read in this transaction
      // (authority/alert-stage, limit usage, idempotency peek) is now consistent
      // with a concurrent authority transition or another admin-credit request for
      // the same coin waiting on the same lock.
      const coinRow = await lockManagedCoinForAdminAdjustment(tx, coin);

      // AC-17/DC-6 — peek BEFORE evaluating AC-15/AC-16/AC-6. The actual replay-vs-
      // conflict judgement (parameter comparison) is made by creditLocalLedger/
      // debitLocalLedger below — this peek only decides whether those checks run.
      const existingEntry = await tx.localLedgerEntry.findUnique({
        where: { coin_idempotencyKey: { coin, idempotencyKey } },
      });

      if (!existingEntry) {
        const gate = evaluateAdminAdjustmentGate({
          balanceAuthority: coinRow?.balanceAuthority ?? null,
          authorityAlertStage: coinRow?.authorityAlertStage ?? null,
          direction,
          reasonType,
        });
        if (isAdminAdjustmentBlocked(gate)) {
          if (gate.reason === 'COIN_NOT_LOCAL') {
            throw new AdminCreditRejection(
              'ADMIN_CREDIT_COIN_NOT_LOCAL',
              'This coin is not local-ledger authoritative — adjustments are only allowed for locally-authoritative coins.',
              400,
            );
          }
          throw new AdminCreditRejection(
            'ADMIN_CREDIT_T2_REASON_RESTRICTED',
            'This coin is halted (T2 — authority violation). While halted, a credit may only use the "Reconciliation fix" reason.',
            400,
          );
        }

        if (direction === 'CREDIT') {
          const [perTx, perDay, cumulative] = await computeAdminCreditLimitRows({ adminId, coin, settings, tx });

          if (perTx.limit == null || amount.gt(new Decimal(perTx.limit))) {
            throw new AdminCreditRejection(
              'ADMIN_CREDIT_LIMIT_PER_TX',
              'This amount exceeds the per-transaction limit. Do not split it into multiple adjustments to work around this.',
              400,
              { limit: perTx.limit },
            );
          }
          if (perDay.limit == null || perDay.used == null || amount.gt(new Decimal(perDay.remaining ?? '0'))) {
            throw new AdminCreditRejection(
              'ADMIN_CREDIT_LIMIT_PER_DAY',
              'This would exceed your rolling 24-hour credit limit for this coin.',
              400,
              { limit: perDay.limit, used: perDay.used, remaining: perDay.remaining },
            );
          }
          if (cumulative.limit == null || cumulative.used == null || amount.gt(new Decimal(cumulative.remaining ?? '0'))) {
            throw new AdminCreditRejection(
              'ADMIN_CREDIT_CUMULATIVE_CAP',
              'This would exceed the cumulative net-credit cap for this coin. Recover with a debit first, or raise the cap deliberately.',
              400,
              { limit: cumulative.limit, used: cumulative.used, remaining: cumulative.remaining },
            );
          }
        }
      }

      const mutate = direction === 'CREDIT' ? creditLocalLedger : debitLocalLedger;
      let entry;
      try {
        entry = await mutate({
          userId: targetUser.id,
          coin,
          amount: amount.toFixed(),
          reasonCode,
          idempotencyKey,
          createdByAdminId: adminId,
          createdByEmail: adminEmail,
          adjustmentReason,
          requestIp,
          tx,
        });
      } catch (e) {
        if (e instanceof LocalLedgerIdempotencyConflictError) {
          throw new AdminCreditRejection(
            'ADMIN_CREDIT_IDEMPOTENCY_CONFLICT',
            'This confirmation key was already used for a different request. Nothing was executed for this request — start a new confirmation.',
            409,
          );
        }
        const code = (e as { code?: string }).code;
        if (code === 'INSUFFICIENT_AVAILABLE_BALANCE') {
          const detail = (e as { detail?: Record<string, unknown> }).detail ?? null;
          throw new AdminCreditRejection(
            'ADMIN_ADJUSTMENT_DEBIT_EXCEEDS_AVAILABLE',
            'Part of this balance is held (stake principal or a pending withdrawal) — only the available part can be debited. Wait for the hold to release or clear the position first.',
            400,
            detail,
          );
        }
        throw e;
      }

      const balanceView = await getUserCoinBalance(targetUser.id, coin, { tx });
      const localLedgerBalanceTotalAfter = await getLocalLedgerBalanceTotal(coin, { tx });
      const adminAdjustmentNetCreditTotalAfter = await getCoinAdminAdjustmentNet(coin, { tx });

      return { entry, balanceView, localLedgerBalanceTotalAfter, adminAdjustmentNetCreditTotalAfter };
    });

    return NextResponse.json({
      ok: true,
      data: {
        entryId: result.entry.id,
        direction,
        coin,
        amount: amount.toFixed(),
        userEmail: targetUser.email,
        balanceAfter: result.balanceView.balance,
        availableAfter: result.balanceView.available,
        localLedgerBalanceTotalAfter: result.localLedgerBalanceTotalAfter,
        adminAdjustmentNetCreditTotalAfter: result.adminAdjustmentNetCreditTotalAfter,
        auditLogId: result.entry.auditLogId ?? null,
        idempotentReplay: result.entry.idempotentReplay === true,
      },
    });
  } catch (e) {
    if (e instanceof AdminCreditRejection) {
      return errRes(e.code, e.message, e.status, e.detail);
    }
    console.error('[admin/credit POST]', e);
    return errRes(
      'ADMIN_CREDIT_INTERNAL_ERROR',
      'Could not complete this adjustment. Check the ledger before retrying — retrying with the same confirmation key never double-executes.',
      500,
    );
  }
}
