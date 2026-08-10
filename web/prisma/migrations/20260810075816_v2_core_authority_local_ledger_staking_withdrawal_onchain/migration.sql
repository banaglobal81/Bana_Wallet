-- CreateEnum
CREATE TYPE "CoinBalanceAuthority" AS ENUM ('HUB', 'LOCAL');

-- CreateEnum
CREATE TYPE "PositionFundingSource" AS ENUM ('USER_BALANCE', 'PLATFORM_GRANT');

-- CreateEnum
CREATE TYPE "StakePositionV2Status" AS ENUM ('ACTIVE', 'MATURED');

-- CreateEnum
CREATE TYPE "CoinAuthorityProbeResult" AS ENUM ('CLEAN', 'UNKNOWN', 'T1_LISTED', 'T2_VIOLATION');

-- CreateEnum
CREATE TYPE "CoinAuthorityAlertStage" AS ENUM ('CLEAR', 'T1_WARNING', 'T2_HALTED');

-- CreateEnum
CREATE TYPE "CoinAuthorityTransitionDirection" AS ENUM ('LOCAL_TO_HUB', 'HUB_TO_LOCAL');

-- CreateEnum
CREATE TYPE "CoinAuthorityTransitionStatus" AS ENUM ('DRAFT', 'FROZEN', 'SNAPSHOTTED', 'FUNDS_MOVED', 'RECONCILED', 'COMPLETED', 'ABORTED');

-- CreateEnum
CREATE TYPE "LocalLedgerEntryType" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "LocalLedgerReasonCode" AS ENUM ('STAKING_CLAIM', 'GRANT_PRINCIPAL_CREDIT', 'DEPOSIT_CONFIRMED', 'REFERRAL_BONUS_CREDIT', 'AUTHORITY_TRANSITION_CREDIT_IN', 'ADMIN_ADJUSTMENT_CREDIT', 'WITHDRAWAL_EXECUTED', 'AUTHORITY_TRANSITION_DEBIT_OUT', 'ADMIN_ADJUSTMENT_DEBIT');

-- CreateEnum
CREATE TYPE "LocalHoldReasonCode" AS ENUM ('WITHDRAWAL_PENDING', 'STAKE_PRINCIPAL_LOCK');

-- CreateEnum
CREATE TYPE "LocalHoldStatus" AS ENUM ('ACTIVE', 'RELEASED', 'EXECUTED');

-- CreateEnum
CREATE TYPE "BalanceSnapshotPurpose" AS ENUM ('AUTHORITY_TRANSITION', 'POR_VERIFICATION', 'MANUAL_ADMIN');

-- CreateEnum
CREATE TYPE "ReserveVerificationTrigger" AS ENUM ('WORKER_PERIODIC', 'MANUAL_ADMIN', 'PRE_AUTHORITY_TRANSITION', 'PRE_ISSUANCE_GATE');

-- CreateEnum
CREATE TYPE "ReserveVerificationResult" AS ENUM ('PASS', 'FAIL', 'INCOMPLETE', 'QUERY_FAILED', 'NO_RESERVE_BASIS');

-- AlterEnum
ALTER TYPE "WithdrawalStatus" ADD VALUE 'AWAITING_ONCHAIN';

-- AlterTable
ALTER TABLE "ManagedCoin" ADD COLUMN     "authorityAlertSince" TIMESTAMP(3),
ADD COLUMN     "authorityAlertStage" "CoinAuthorityAlertStage" NOT NULL DEFAULT 'CLEAR',
ADD COLUMN     "balanceAuthority" "CoinBalanceAuthority" NOT NULL DEFAULT 'LOCAL',
ADD COLUMN     "directAuthorityChangeInProgress" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastProbeAt" TIMESTAMP(3),
ADD COLUMN     "lastProbeResult" "CoinAuthorityProbeResult";

-- AlterTable
ALTER TABLE "PlatformSetting" ADD COLUMN     "authorityProbeEscalatedIntervalMinutes" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "authorityProbeIntervalMinutes" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "authorityProbeUnknownEscalationCount" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "authorityProbeWorkerEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "porGateEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "porGateMaxStalenessMinutes" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "porVerificationIntervalMinutes" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "porVerificationWorkerEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "stakingClaimEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stakingV2WorkerDailyTime" TEXT NOT NULL DEFAULT '00:00',
ADD COLUMN     "stakingV2WorkerEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stakingV2WorkerIntervalMinutes" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "stakingV2WorkerMode" TEXT NOT NULL DEFAULT 'INTERVAL',
ADD COLUMN     "withdrawalOnchainMinConfirmations" INTEGER NOT NULL DEFAULT 15;

-- AlterTable
ALTER TABLE "WithdrawalRequest" ADD COLUMN     "balanceAuthorityAtRequest" "CoinBalanceAuthority" NOT NULL DEFAULT 'HUB',
ADD COLUMN     "debitTotal" TEXT,
ADD COLUMN     "feeAmount" TEXT,
ADD COLUMN     "localHoldId" TEXT,
ADD COLUMN     "onchainChainId" INTEGER,
ADD COLUMN     "onchainTxHash" TEXT,
ADD COLUMN     "onchainVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WithdrawalOnchainVerificationAttempt" (
    "id" TEXT NOT NULL,
    "withdrawalRequestId" TEXT NOT NULL,
    "submittedTxHash" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "detail" TEXT,
    "confirmationsAtCheck" INTEGER,
    "checkedByAdminId" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WithdrawalOnchainVerificationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WithdrawalOnchainSettlement" (
    "id" TEXT NOT NULL,
    "withdrawalRequestId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "txHash" TEXT NOT NULL,
    "observedAmount" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WithdrawalOnchainSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StakingProductV2" (
    "id" TEXT NOT NULL,
    "coin" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "termDays" INTEGER NOT NULL,
    "baseDailyRatePct" TEXT NOT NULL,
    "maxBonusPctOfBase" TEXT NOT NULL DEFAULT '0',
    "minAmount" TEXT,
    "maxAmount" TEXT,
    "capacity" TEXT,
    "status" "StakingProductStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StakingProductV2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StakePositionV2" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "niaUserId" TEXT,
    "productId" TEXT NOT NULL,
    "coin" TEXT NOT NULL,
    "principal" TEXT NOT NULL,
    "baseDailyRatePct" TEXT NOT NULL,
    "maxBonusPctOfBase" TEXT NOT NULL DEFAULT '0',
    "termDays" INTEGER NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "maturityAt" TIMESTAMP(3) NOT NULL,
    "status" "StakePositionV2Status" NOT NULL DEFAULT 'ACTIVE',
    "fundingSource" "PositionFundingSource" NOT NULL,
    "grantedByAdminId" TEXT,
    "principalHoldId" TEXT,
    "ledgeredYield" TEXT NOT NULL DEFAULT '0',
    "daysPaid" INTEGER NOT NULL DEFAULT 0,
    "lastSettledAt" TIMESTAMP(3),
    "fullySettledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantPrincipalCreditedAt" TIMESTAMP(3),
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "renewalStatus" "StakeRenewalStatus" NOT NULL DEFAULT 'NONE',
    "renewedIntoPositionId" TEXT,
    "renewedFromPositionId" TEXT,
    "renewalProcessedAt" TIMESTAMP(3),
    "renewalAttempts" INTEGER NOT NULL DEFAULT 0,
    "renewalNotifiedAt" TIMESTAMP(3),
    "maturityReminderSentAt" TIMESTAMP(3),

    CONSTRAINT "StakePositionV2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StakeYieldLedgerEntry" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "coin" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "baseAmount" TEXT NOT NULL,
    "bonusAmount" TEXT NOT NULL DEFAULT '0',
    "amount" TEXT NOT NULL,
    "mpSnapshot" TEXT,
    "bonusPctSnapshot" TEXT NOT NULL DEFAULT '0',
    "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StakeYieldLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCoinYieldSummary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "coin" TEXT NOT NULL,
    "ledgeredYieldTotal" TEXT NOT NULL DEFAULT '0',
    "claimedYieldTotal" TEXT NOT NULL DEFAULT '0',
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCoinYieldSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinAuthorityProbe" (
    "id" TEXT NOT NULL,
    "managedCoinId" TEXT NOT NULL,
    "coinSymbol" TEXT NOT NULL,
    "authorityAtProbe" "CoinBalanceAuthority" NOT NULL,
    "result" "CoinAuthorityProbeResult" NOT NULL,
    "hubListed" BOOLEAN NOT NULL,
    "hubBalanceUserId" TEXT,
    "hubBalanceAmount" TEXT,
    "consecutiveUnknownCount" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL,
    "probedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoinAuthorityProbe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinAuthorityTransition" (
    "id" TEXT NOT NULL,
    "managedCoinId" TEXT NOT NULL,
    "coinSymbol" TEXT NOT NULL,
    "direction" "CoinAuthorityTransitionDirection" NOT NULL,
    "status" "CoinAuthorityTransitionStatus" NOT NULL DEFAULT 'DRAFT',
    "triggeredByProbeId" TEXT,
    "initiatedByAdminId" TEXT NOT NULL,
    "initiatedByEmail" TEXT NOT NULL,
    "frozenAt" TIMESTAMP(3),
    "snapshotAt" TIMESTAMP(3),
    "snapshotTotal" TEXT,
    "snapshotRef" TEXT,
    "fundsMovedAt" TIMESTAMP(3),
    "fundsMovedTxRef" TEXT,
    "fundsMovedAmount" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "reconciliationMismatch" TEXT,
    "completedAt" TIMESTAMP(3),
    "abortedAt" TIMESTAMP(3),
    "abortReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoinAuthorityTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCoinBalance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "coin" TEXT NOT NULL,
    "balance" TEXT NOT NULL DEFAULT '0',
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCoinBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalLedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "coin" TEXT NOT NULL,
    "type" "LocalLedgerEntryType" NOT NULL,
    "reasonCode" "LocalLedgerReasonCode" NOT NULL,
    "amount" TEXT NOT NULL,
    "balanceAfter" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "relatedType" TEXT,
    "relatedId" TEXT,
    "createdByAdminId" TEXT,
    "createdByEmail" TEXT,
    "adjustmentReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocalLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalBalanceHold" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "coin" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "reasonCode" "LocalHoldReasonCode" NOT NULL,
    "status" "LocalHoldStatus" NOT NULL DEFAULT 'ACTIVE',
    "relatedType" TEXT NOT NULL,
    "relatedId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "releasedReason" TEXT,
    "executedLedgerEntryId" TEXT,

    CONSTRAINT "LocalBalanceHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalBalanceSnapshotBatch" (
    "id" TEXT NOT NULL,
    "coin" TEXT NOT NULL,
    "purpose" "BalanceSnapshotPurpose" NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalBalance" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "initiatedByAdminId" TEXT,
    "initiatedByEmail" TEXT,

    CONSTRAINT "LocalBalanceSnapshotBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalBalanceSnapshotRow" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" TEXT NOT NULL,
    "heldTotal" TEXT NOT NULL,

    CONSTRAINT "LocalBalanceSnapshotRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformControlledAddress" (
    "id" TEXT NOT NULL,
    "coin" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "addedByAdminId" TEXT NOT NULL,
    "addedByEmail" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "PlatformControlledAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReserveVerificationRun" (
    "id" TEXT NOT NULL,
    "coin" TEXT NOT NULL,
    "trigger" "ReserveVerificationTrigger" NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "localLedgerBalanceTotal" TEXT NOT NULL,
    "unclaimedLedgeredInterestTotal" TEXT,
    "grantPrincipalPayableTotal" TEXT,
    "referralPayableTotal" TEXT,
    "leftTotal" TEXT,
    "activeUserFundedPrincipalTotal" TEXT,
    "stakePrincipalHoldTotal" TEXT,
    "withdrawalPendingHoldTotal" TEXT,
    "inFlightOnchainWithdrawalTotal" TEXT,
    "compensationPlanCommitmentTotal" TEXT,
    "controlledAddressCount" INTEGER NOT NULL,
    "controlledOnchainBalanceTotal" TEXT NOT NULL,
    "result" "ReserveVerificationResult" NOT NULL,
    "marginAmount" TEXT,
    "breachDetail" TEXT,
    "blocksIssuance" BOOLEAN NOT NULL DEFAULT false,
    "snapshotBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReserveVerificationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WithdrawalOnchainVerificationAttempt_withdrawalRequestId_ch_idx" ON "WithdrawalOnchainVerificationAttempt"("withdrawalRequestId", "checkedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WithdrawalOnchainSettlement_withdrawalRequestId_key" ON "WithdrawalOnchainSettlement"("withdrawalRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "WithdrawalOnchainSettlement_chainId_txHash_key" ON "WithdrawalOnchainSettlement"("chainId", "txHash");

-- CreateIndex
CREATE INDEX "StakingProductV2_status_idx" ON "StakingProductV2"("status");

-- CreateIndex
CREATE INDEX "StakingProductV2_coin_status_idx" ON "StakingProductV2"("coin", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StakePositionV2_principalHoldId_key" ON "StakePositionV2"("principalHoldId");

-- CreateIndex
CREATE UNIQUE INDEX "StakePositionV2_renewedIntoPositionId_key" ON "StakePositionV2"("renewedIntoPositionId");

-- CreateIndex
CREATE INDEX "StakePositionV2_userId_status_idx" ON "StakePositionV2"("userId", "status");

-- CreateIndex
CREATE INDEX "StakePositionV2_status_idx" ON "StakePositionV2"("status");

-- CreateIndex
CREATE INDEX "StakePositionV2_renewedFromPositionId_idx" ON "StakePositionV2"("renewedFromPositionId");

-- CreateIndex
CREATE INDEX "StakePositionV2_status_autoRenew_maturityAt_idx" ON "StakePositionV2"("status", "autoRenew", "maturityAt");

-- CreateIndex
CREATE INDEX "StakePositionV2_userId_coin_status_idx" ON "StakePositionV2"("userId", "coin", "status");

-- CreateIndex
CREATE INDEX "StakePositionV2_coin_fundingSource_status_idx" ON "StakePositionV2"("coin", "fundingSource", "status");

-- CreateIndex
CREATE INDEX "StakeYieldLedgerEntry_userId_coin_idx" ON "StakeYieldLedgerEntry"("userId", "coin");

-- CreateIndex
CREATE INDEX "StakeYieldLedgerEntry_userId_settledAt_idx" ON "StakeYieldLedgerEntry"("userId", "settledAt");

-- CreateIndex
CREATE UNIQUE INDEX "StakeYieldLedgerEntry_positionId_dayIndex_key" ON "StakeYieldLedgerEntry"("positionId", "dayIndex");

-- CreateIndex
CREATE INDEX "UserCoinYieldSummary_coin_idx" ON "UserCoinYieldSummary"("coin");

-- CreateIndex
CREATE UNIQUE INDEX "UserCoinYieldSummary_userId_coin_key" ON "UserCoinYieldSummary"("userId", "coin");

-- CreateIndex
CREATE INDEX "CoinAuthorityProbe_coinSymbol_probedAt_idx" ON "CoinAuthorityProbe"("coinSymbol", "probedAt");

-- CreateIndex
CREATE INDEX "CoinAuthorityProbe_managedCoinId_result_probedAt_idx" ON "CoinAuthorityProbe"("managedCoinId", "result", "probedAt");

-- CreateIndex
CREATE INDEX "CoinAuthorityTransition_managedCoinId_status_idx" ON "CoinAuthorityTransition"("managedCoinId", "status");

-- CreateIndex
CREATE INDEX "CoinAuthorityTransition_status_idx" ON "CoinAuthorityTransition"("status");

-- CreateIndex
CREATE INDEX "UserCoinBalance_coin_idx" ON "UserCoinBalance"("coin");

-- CreateIndex
CREATE UNIQUE INDEX "UserCoinBalance_userId_coin_key" ON "UserCoinBalance"("userId", "coin");

-- CreateIndex
CREATE INDEX "LocalLedgerEntry_userId_coin_createdAt_idx" ON "LocalLedgerEntry"("userId", "coin", "createdAt");

-- CreateIndex
CREATE INDEX "LocalLedgerEntry_relatedType_relatedId_idx" ON "LocalLedgerEntry"("relatedType", "relatedId");

-- CreateIndex
CREATE UNIQUE INDEX "LocalLedgerEntry_coin_idempotencyKey_key" ON "LocalLedgerEntry"("coin", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "LocalBalanceHold_executedLedgerEntryId_key" ON "LocalBalanceHold"("executedLedgerEntryId");

-- CreateIndex
CREATE INDEX "LocalBalanceHold_userId_coin_status_idx" ON "LocalBalanceHold"("userId", "coin", "status");

-- CreateIndex
CREATE INDEX "LocalBalanceHold_relatedType_relatedId_idx" ON "LocalBalanceHold"("relatedType", "relatedId");

-- CreateIndex
CREATE UNIQUE INDEX "LocalBalanceHold_relatedType_relatedId_reasonCode_key" ON "LocalBalanceHold"("relatedType", "relatedId", "reasonCode");

-- CreateIndex
CREATE INDEX "LocalBalanceSnapshotBatch_coin_purpose_takenAt_idx" ON "LocalBalanceSnapshotBatch"("coin", "purpose", "takenAt");

-- CreateIndex
CREATE UNIQUE INDEX "LocalBalanceSnapshotRow_batchId_userId_key" ON "LocalBalanceSnapshotRow"("batchId", "userId");

-- CreateIndex
CREATE INDEX "PlatformControlledAddress_coin_active_idx" ON "PlatformControlledAddress"("coin", "active");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformControlledAddress_coin_network_address_key" ON "PlatformControlledAddress"("coin", "network", "address");

-- CreateIndex
CREATE INDEX "ReserveVerificationRun_coin_ranAt_idx" ON "ReserveVerificationRun"("coin", "ranAt");

-- CreateIndex
CREATE INDEX "ReserveVerificationRun_coin_result_ranAt_idx" ON "ReserveVerificationRun"("coin", "result", "ranAt");

-- CreateIndex
CREATE INDEX "ManagedCoin_balanceAuthority_idx" ON "ManagedCoin"("balanceAuthority");

-- CreateIndex
CREATE INDEX "ManagedCoin_authorityAlertStage_idx" ON "ManagedCoin"("authorityAlertStage");

-- CreateIndex
CREATE INDEX "WithdrawalRequest_balanceAuthorityAtRequest_status_idx" ON "WithdrawalRequest"("balanceAuthorityAtRequest", "status");

-- AddForeignKey
ALTER TABLE "WithdrawalOnchainVerificationAttempt" ADD CONSTRAINT "WithdrawalOnchainVerificationAttempt_withdrawalRequestId_fkey" FOREIGN KEY ("withdrawalRequestId") REFERENCES "WithdrawalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalOnchainSettlement" ADD CONSTRAINT "WithdrawalOnchainSettlement_withdrawalRequestId_fkey" FOREIGN KEY ("withdrawalRequestId") REFERENCES "WithdrawalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakePositionV2" ADD CONSTRAINT "StakePositionV2_productId_fkey" FOREIGN KEY ("productId") REFERENCES "StakingProductV2"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakePositionV2" ADD CONSTRAINT "StakePositionV2_renewedIntoPositionId_fkey" FOREIGN KEY ("renewedIntoPositionId") REFERENCES "StakePositionV2"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "StakeYieldLedgerEntry" ADD CONSTRAINT "StakeYieldLedgerEntry_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "StakePositionV2"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinAuthorityProbe" ADD CONSTRAINT "CoinAuthorityProbe_managedCoinId_fkey" FOREIGN KEY ("managedCoinId") REFERENCES "ManagedCoin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinAuthorityTransition" ADD CONSTRAINT "CoinAuthorityTransition_managedCoinId_fkey" FOREIGN KEY ("managedCoinId") REFERENCES "ManagedCoin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinAuthorityTransition" ADD CONSTRAINT "CoinAuthorityTransition_triggeredByProbeId_fkey" FOREIGN KEY ("triggeredByProbeId") REFERENCES "CoinAuthorityProbe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalBalanceHold" ADD CONSTRAINT "LocalBalanceHold_executedLedgerEntryId_fkey" FOREIGN KEY ("executedLedgerEntryId") REFERENCES "LocalLedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalBalanceSnapshotRow" ADD CONSTRAINT "LocalBalanceSnapshotRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "LocalBalanceSnapshotBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
