export const runtime = 'nodejs';

// POST /api/admin/withdrawals/[id]/submit-tx — A-5 §1.5 steps 1-10 (LOCAL rail
// only). The admin has already executed the on-chain BEP-20 transfer *outside*
// this application (no signing/private-key code exists anywhere in this
// codebase — CLAUDE.md-consistent non-custodial execution) and submits the
// resulting txHash here. This route calls the already-implemented, read-only
// verifyOnchainWithdrawal() (via submitWithdrawalOnchainTx()) — see
// web/src/lib/onchain/verifyWithdrawal.ts. Per the task instructions, the RPC
// stub inside that file is left untouched; this route only wires the call.

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { niaState } from '@/lib/nia/state';
import { submitWithdrawalOnchainTx, type SubmitWithdrawalOnchainTxOutcome } from '@/lib/withdrawalOnchain';

// Same "strict:false discriminated-union narrowing gap" this codebase
// documents in localLedger.ts/onchain/verifyWithdrawal.ts — a type-predicate
// function forces the narrowing where plain `if (!outcome.ok)` does not.
function isSubmitTxFailure(
  o: SubmitWithdrawalOnchainTxOutcome,
): o is Extract<SubmitWithdrawalOnchainTxOutcome, { ok: false }> {
  return o.ok === false;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let adminId: string | undefined;
  try {
    const me = (await requireAdmin()) as { id?: string };
    adminId = me.id;
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }
  if (!adminId) return NextResponse.json({ ok: false, error: 'Admin session missing an id.' }, { status: 500 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const txHash = typeof body?.txHash === 'string' ? body.txHash.trim() : '';
  if (!txHash) return NextResponse.json({ ok: false, error: 'txHash is required' }, { status: 400 });

  // niaState.inFlightOnchainVerifications was reserved in advance exactly for
  // this route (see its doc comment in web/src/lib/nia/state.ts) — a
  // per-process "fast path" concurrency guard. The DB-level defenses (the
  // AWAITING_ONCHAIN->APPROVED atomic claim and the (chainId, txHash) unique
  // constraint) are the real ones, A-5 §1.5.
  const guardKey = `submit-tx:${id}`;
  if (niaState.inFlightOnchainVerifications.has(guardKey)) {
    return NextResponse.json({ ok: false, error: 'A verification for this withdrawal is already in progress.' }, { status: 409 });
  }
  niaState.inFlightOnchainVerifications.add(guardKey);

  try {
    const outcome = await submitWithdrawalOnchainTx(id, txHash, { adminId });
    if (isSubmitTxFailure(outcome)) {
      // W-5 — never a 200/"success"; the request itself succeeded (we got an
      // answer), but verification did not pass. Status stays AWAITING_ONCHAIN.
      return NextResponse.json({ ok: false, error: outcome.error, reason: outcome.reason });
    }
    return NextResponse.json({ ok: true, data: { status: 'APPROVED' } });
  } catch (e) {
    console.error('[admin/withdrawals/submit-tx] error:', e);
    return NextResponse.json({ ok: false, error: 'Verification service unavailable. Please try again later.' }, { status: 503 });
  } finally {
    niaState.inFlightOnchainVerifications.delete(guardKey);
  }
}
