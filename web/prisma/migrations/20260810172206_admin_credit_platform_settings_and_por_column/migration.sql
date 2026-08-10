-- AlterTable
ALTER TABLE "PlatformSetting" ADD COLUMN     "adminCreditCumulativeCap" TEXT DEFAULT '100000',
ADD COLUMN     "adminCreditEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "adminCreditMaxPerDay" TEXT DEFAULT '20000',
ADD COLUMN     "adminCreditMaxPerTx" TEXT DEFAULT '5000',
ADD COLUMN     "maxInterestLiabilityCapBana" TEXT DEFAULT '10000';

-- AlterTable
ALTER TABLE "ReserveVerificationRun" ADD COLUMN     "adminAdjustmentNetCreditTotal" TEXT;
