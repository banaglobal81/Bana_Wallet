export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/admin/solvency — A-8 §5 data contract for /admin/reserve + the
// /admin/dashboard PoR strip. requireAdmin()-gated (CLAUDE.md rule 8 / task
// "Security Rules"). Read-only: DC-10 — this route must never itself trigger
// a ReserveVerificationRun (that is POST /api/admin/reserve/verify, a
// separate explicit action). All amount arithmetic uses decimal.js
// (CLAUDE.md rule 2) — no Number()/parseFloat() on any ledger string.
//
// Deliberately does not implement A-8's reconciliation sub-panel
// (LocalLedgerSection.reconciliation) — the schema (A-3) has no persisted
// "reconciliation run" table, and reconcileUserCoinBalances() itself writes
// an AuditLog row on mismatch, which would make this GET route have a write
// side effect (violates DC-10). Left as `lastRunAt: null` ("never
// reconciled", per LL-6 — honest, not "0 mismatches"). A future task can add
// a persisted reconciliation-run record and a dedicated manual-trigger route
// mirroring POST /api/admin/reserve/verify.

import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/session';
import { getPlatformSettings } from '@/lib/platformSettings';

type Section<T> = ({ status: 'OK' } & T) | { status: 'UNAVAILABLE'; reason: string };

type PorComponentRole = 'ADDITIVE' | 'SUBSET_OF_LOCAL_BALANCE' | 'PROGRAM_COMMITMENT' | 'TIMING_ADJUSTMENT';

interface ReserveComponent {
  key: string;
  amount: string | null;
  role: PorComponentRole;
  blockedBy: 'H2_UNDECIDED' | null;
}

function sumDecimal(values: string[]): Decimal {
  return values.reduce((acc, v) => acc.plus(new Decimal(v)), new Decimal(0));
}

function buildComponents(run: {
  localLedgerBalanceTotal: string;
  unclaimedLedgeredInterestTotal: string | null;
  grantPrincipalPayableTotal: string | null;
  referralPayableTotal: string | null;
  activeUserFundedPrincipalTotal: string | null;
  stakePrincipalHoldTotal: string | null;
  withdrawalPendingHoldTotal: string | null;
  compensationPlanCommitmentTotal: string | null;
  inFlightOnchainWithdrawalTotal: string | null;
}): ReserveComponent[] {
  return [
    { key: 'localLedgerBalanceTotal', amount: run.localLedgerBalanceTotal, role: 'ADDITIVE', blockedBy: null },
    {
      key: 'unclaimedLedgeredInterestTotal',
      amount: run.unclaimedLedgeredInterestTotal,
      role: 'ADDITIVE',
      blockedBy: null,
    },
    {
      key: 'grantPrincipalPayableTotal',
      amount: run.grantPrincipalPayableTotal,
      role: 'ADDITIVE',
      blockedBy: run.grantPrincipalPayableTotal == null ? 'H2_UNDECIDED' : null,
    },
    { key: 'referralPayableTotal', amount: run.referralPayableTotal, role: 'ADDITIVE', blockedBy: null },
    {
      key: 'activeUserFundedPrincipalTotal',
      amount: run.activeUserFundedPrincipalTotal,
      role: 'SUBSET_OF_LOCAL_BALANCE',
      blockedBy: null,
    },
    {
      key: 'withdrawalPendingHoldTotal',
      amount: run.withdrawalPendingHoldTotal,
      role: 'SUBSET_OF_LOCAL_BALANCE',
      blockedBy: null,
    },
    {
      key: 'compensationPlanCommitmentTotal',
      amount: run.compensationPlanCommitmentTotal,
      role: 'PROGRAM_COMMITMENT',
      blockedBy: null,
    },
    {
      key: 'inFlightOnchainWithdrawalTotal',
      amount: run.inFlightOnchainWithdrawalTotal,
      role: 'TIMING_ADJUSTMENT',
      blockedBy: null,
    },
  ];
}

export async function GET(): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  try {
    const settings = await getPlatformSettings();
    const managedCoins = await prisma.managedCoin.findMany({
      include: {
        authorityProbes: { orderBy: { probedAt: 'desc' }, take: 1 },
        authorityTransitions: {
          where: { status: { in: ['DRAFT', 'FROZEN', 'SNAPSHOTTED', 'FUNDS_MOVED', 'RECONCILED'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { symbol: 'asc' },
    });

    const staleAfterMinutes = Math.max(3 * settings.porVerificationIntervalMinutes, 60);
    const incidents: Array<Record<string, unknown>> = [];
    const warnings: Array<Record<string, unknown>> = [];
    const coins: Array<Record<string, unknown>> = [];

    for (const mc of managedCoins) {
      let reserve: Section<Record<string, unknown>>;
      let liability: Section<Record<string, unknown>>;
      let localLedger: Section<Record<string, unknown>>;
      let latestRun: Awaited<ReturnType<typeof prisma.reserveVerificationRun.findFirst>> = null;

      if (mc.balanceAuthority === 'LOCAL') {
        try {
          latestRun = await prisma.reserveVerificationRun.findFirst({
            where: { coin: mc.symbol },
            orderBy: { ranAt: 'desc' },
          });
          const activeControlledAddressCount = await prisma.platformControlledAddress.count({
            where: { coin: mc.symbol, active: true },
          });
          const isStale = latestRun
            ? Date.now() - latestRun.ranAt.getTime() > staleAfterMinutes * 60_000
            : false;

          reserve = {
            status: 'OK',
            latestRun: latestRun
              ? {
                  id: latestRun.id,
                  ranAt: latestRun.ranAt.toISOString(),
                  trigger: latestRun.trigger,
                  result: latestRun.result,
                  leftTotal: latestRun.leftTotal,
                  rightTotal: latestRun.controlledOnchainBalanceTotal,
                  marginAmount: latestRun.marginAmount,
                  breachDetail: latestRun.breachDetail,
                  blocksIssuance: latestRun.blocksIssuance,
                  controlledAddressCount: latestRun.controlledAddressCount,
                  components: buildComponents(latestRun),
                }
              : null,
            workerEnabled: settings.porVerificationWorkerEnabled,
            intervalMinutes: settings.porVerificationIntervalMinutes,
            staleAfterMinutes,
            isStale,
            consecutiveQueryFailedCount: 0, // no persisted streak counter yet — see HI-3/§8.1 QUERY_FAILED streak (future work)
            activeControlledAddressCount,
            inFlightOnchainWithdrawalTotal: latestRun?.inFlightOnchainWithdrawalTotal ?? null,
          };

          const onchainSettledEntries = await prisma.localLedgerEntry.findMany({
            where: { coin: mc.symbol, reasonCode: 'WITHDRAWAL_EXECUTED' },
            select: { amount: true },
          });
          const onchainSettledTotal = sumDecimal(onchainSettledEntries.map((e) => e.amount)).toFixed();

          liability = {
            status: 'OK',
            leftTotal: latestRun?.leftTotal ?? null,
            components: latestRun ? buildComponents(latestRun) : [],
            dailyAccrualRate: null, // A-4 settlement-rate query not in this task's scope
            onchainSettledTotal,
            withdrawalRailStatus: 'MANUAL_ONCHAIN',
            claimRailStatus: settings.stakingClaimEnabled ? 'ENABLED' : 'DISABLED',
          };

          const balances = await prisma.userCoinBalance.findMany({
            where: { coin: mc.symbol },
            select: { balance: true },
          });
          const balanceTotal = sumDecimal(balances.map((b) => b.balance));
          const nonZeroBalanceUserCount = balances.filter((b) => !new Decimal(b.balance).isZero()).length;
          const ledgerEntryCount = await prisma.localLedgerEntry.count({ where: { coin: mc.symbol } });

          const holds = await prisma.localBalanceHold.findMany({
            where: { coin: mc.symbol, status: 'ACTIVE' },
            select: { amount: true, reasonCode: true },
          });
          const withdrawalHolds = holds.filter((h) => h.reasonCode === 'WITHDRAWAL_PENDING');
          const stakeHolds = holds.filter((h) => h.reasonCode === 'STAKE_PRINCIPAL_LOCK');
          const withdrawalHoldsTotal = sumDecimal(withdrawalHolds.map((h) => h.amount));
          const stakeHoldsTotal = sumDecimal(stakeHolds.map((h) => h.amount));
          const heldTotal = withdrawalHoldsTotal.plus(stakeHoldsTotal);

          const openWithdrawals = await prisma.withdrawalRequest.findMany({
            where: {
              currency: mc.symbol,
              balanceAuthorityAtRequest: 'LOCAL',
              status: { in: ['PENDING', 'PROCESSING', 'AWAITING_ONCHAIN'] },
            },
            select: { debitTotal: true, amount: true },
          });
          const openWithdrawalRequestTotal = sumDecimal(
            openWithdrawals.map((w) => w.debitTotal ?? w.amount),
          );
          const holdInvariantMatches = withdrawalHoldsTotal.equals(openWithdrawalRequestTotal);

          localLedger = {
            status: 'OK',
            balanceTotal: balanceTotal.toFixed(),
            heldTotal: heldTotal.toFixed(),
            availableTotal: balanceTotal.minus(heldTotal).toFixed(),
            heldByReason: [
              { reasonCode: 'WITHDRAWAL_PENDING', amount: withdrawalHoldsTotal.toFixed(), count: withdrawalHolds.length },
              { reasonCode: 'STAKE_PRINCIPAL_LOCK', amount: stakeHoldsTotal.toFixed(), count: stakeHolds.length },
            ],
            nonZeroBalanceUserCount,
            ledgerEntryCount,
            reconciliation: { lastRunAt: null, checkedCount: null, mismatchCount: null, versionDriftCount: null },
            holdInvariant: {
              holdsTotal: withdrawalHoldsTotal.toFixed(),
              openWithdrawalRequestTotal: openWithdrawalRequestTotal.toFixed(),
              matches: holdInvariantMatches,
            },
          };

          if (!holdInvariantMatches) {
            incidents.push({
              code: 'HOLD_INVARIANT_BROKEN',
              coin: mc.symbol,
              holds: withdrawalHoldsTotal.toFixed(),
              requests: openWithdrawalRequestTotal.toFixed(),
            });
          }
          if (latestRun?.result === 'FAIL') {
            incidents.push({ code: 'POR_FAIL', coin: mc.symbol, runId: latestRun.id });
          }
          const issuanceOn = settings.stakingClaimEnabled || settings.stakingV2WorkerEnabled;
          if (issuanceOn && (!latestRun || latestRun.result !== 'PASS')) {
            incidents.push({
              code: 'ISSUING_WITHOUT_VERIFICATION',
              coin: mc.symbol,
              state: latestRun?.result ?? 'NEVER_RUN',
            });
          }
        } catch (e) {
          const reason = (e as Error).message;
          reserve = { status: 'UNAVAILABLE', reason };
          liability = { status: 'UNAVAILABLE', reason };
          localLedger = { status: 'UNAVAILABLE', reason };
        }
      } else {
        reserve = { status: 'UNAVAILABLE', reason: 'HUB-authority coin — no reserve concept (X-2).' };
        liability = { status: 'UNAVAILABLE', reason: 'HUB-authority coin — no local liability.' };
        // LL-9 — a HUB-authority coin with local-ledger rows is itself an incident; check regardless.
        const hubLocalBalances = await prisma.userCoinBalance.findMany({
          where: { coin: mc.symbol },
          select: { balance: true },
        });
        const hubLocalTotal = sumDecimal(hubLocalBalances.map((b) => b.balance));
        if (!hubLocalTotal.isZero()) {
          localLedger = {
            status: 'OK',
            balanceTotal: hubLocalTotal.toFixed(),
            heldTotal: '0',
            availableTotal: hubLocalTotal.toFixed(),
            heldByReason: [],
            nonZeroBalanceUserCount: hubLocalBalances.filter((b) => !new Decimal(b.balance).isZero()).length,
            ledgerEntryCount: 0,
            reconciliation: { lastRunAt: null, checkedCount: null, mismatchCount: null, versionDriftCount: null },
            holdInvariant: { holdsTotal: '0', openWithdrawalRequestTotal: '0', matches: true },
          };
          incidents.push({ code: 'HUB_COIN_HAS_LOCAL_BALANCE', coin: mc.symbol });
        } else {
          localLedger = { status: 'UNAVAILABLE', reason: 'HUB-authority coin — no local ledger.' };
        }
      }

      // Issuance gate (§6.5).
      const blockers: Array<Record<string, unknown>> = [];
      if (mc.authorityAlertStage === 'T2_HALTED') blockers.push({ code: 'AUTHORITY_T2_HALTED' });
      if (mc.authorityAlertStage === 'T1_WARNING') blockers.push({ code: 'AUTHORITY_T1_WARNING' });
      if (mc.balanceAuthority === 'LOCAL') {
        if (!latestRun) blockers.push({ code: 'POR_NOT_VERIFIED', state: 'NEVER_RUN' });
        else if (latestRun.result === 'FAIL') blockers.push({ code: 'POR_FAIL', runId: latestRun.id });
        else if (latestRun.result !== 'PASS') blockers.push({ code: 'POR_NOT_VERIFIED', state: latestRun.result });
      }
      if (!settings.stakingClaimEnabled) blockers.push({ code: 'KILL_SWITCH_CLAIM_DISABLED' });
      if (!settings.stakingV2WorkerEnabled) blockers.push({ code: 'KILL_SWITCH_SETTLEMENT_DISABLED' });
      if (settings.maintenanceMode) blockers.push({ code: 'MAINTENANCE_MODE' });

      const issuanceGate: Section<Record<string, unknown>> = {
        status: 'OK',
        blockers,
        settlementWorkerEnabled: settings.stakingV2WorkerEnabled,
        claimEnabled: settings.stakingClaimEnabled,
      };

      // Authority watch (§6.6) — ALL coins, not just LOCAL (LL-9's reverse check).
      const lastProbe = mc.authorityProbes[0] ?? null;
      const probeStaleAfterMinutes = Math.max(3 * settings.authorityProbeIntervalMinutes, 60);
      const probeIsStale = mc.lastProbeAt
        ? Date.now() - mc.lastProbeAt.getTime() > probeStaleAfterMinutes * 60_000
        : true;
      const activeTransition = mc.authorityTransitions[0] ?? null;

      const authorityWatch: Section<Record<string, unknown>> = {
        status: 'OK',
        authority: mc.balanceAuthority,
        alertStage: mc.authorityAlertStage,
        alertSince: mc.authorityAlertSince?.toISOString() ?? null,
        lastProbeAt: mc.lastProbeAt?.toISOString() ?? null,
        lastProbeResult: mc.lastProbeResult ?? null,
        consecutiveUnknownCount: lastProbe?.consecutiveUnknownCount ?? 0,
        probeWorkerEnabled: settings.authorityProbeWorkerEnabled,
        probeIsStale,
        hubListed: lastProbe?.hubListed ?? false,
        t2Evidence:
          lastProbe && lastProbe.result === 'T2_VIOLATION' && lastProbe.hubBalanceUserId && lastProbe.hubBalanceAmount
            ? { userId: lastProbe.hubBalanceUserId, amount: lastProbe.hubBalanceAmount, probedAt: lastProbe.probedAt.toISOString() }
            : null,
        activeTransition: activeTransition
          ? {
              id: activeTransition.id,
              direction: activeTransition.direction,
              status: activeTransition.status,
              startedAt: activeTransition.createdAt.toISOString(),
            }
          : null,
        unknownEscalationThreshold: settings.authorityProbeUnknownEscalationCount,
      };

      if (mc.authorityAlertStage === 'T2_HALTED') {
        incidents.push({ code: 'AUTHORITY_T2', coin: mc.symbol });
      } else if (mc.authorityAlertStage === 'T1_WARNING') {
        warnings.push({ code: 'AUTHORITY_T1', coin: mc.symbol });
      }

      coins.push({
        coin: mc.symbol,
        authority: mc.balanceAuthority,
        reserve,
        liability,
        localLedger,
        issuanceGate,
        authorityWatch,
      });
    }

    return NextResponse.json({ ok: true, data: { coins, incidents, warnings } });
  } catch (e) {
    console.error('[admin/solvency] error:', e);
    return NextResponse.json({ ok: false, error: 'Solvency service unavailable. Please try again later.' }, { status: 503 });
  }
}
