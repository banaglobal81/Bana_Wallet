/*
  Warnings:

  - A unique constraint covering the columns `[renewedIntoPositionId]` on the table `StakePosition` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "StakeRenewalStatus" AS ENUM ('NONE', 'RENEWED', 'FAILED_PRODUCT_CLOSED', 'FAILED_CAPACITY', 'FAILED_BELOW_MIN', 'FAILED_ABOVE_MAX', 'FAILED_RATE_LOWERED', 'FAILED_TERMS_CHANGED', 'FAILED_ACCOUNT_INACTIVE', 'FAILED_SYSTEM');

-- AlterTable
ALTER TABLE "StakePosition" ADD COLUMN     "autoRenew" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "grantedByAdminId" TEXT,
ADD COLUMN     "maturityReminderSentAt" TIMESTAMP(3),
ADD COLUMN     "renewalAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "renewalNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "renewalProcessedAt" TIMESTAMP(3),
ADD COLUMN     "renewalStatus" "StakeRenewalStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "renewedFromPositionId" TEXT,
ADD COLUMN     "renewedIntoPositionId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "locale" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "StakePosition_renewedIntoPositionId_key" ON "StakePosition"("renewedIntoPositionId");

-- CreateIndex
CREATE INDEX "StakePosition_renewedFromPositionId_idx" ON "StakePosition"("renewedFromPositionId");

-- CreateIndex
CREATE INDEX "StakePosition_status_autoRenew_maturityAt_idx" ON "StakePosition"("status", "autoRenew", "maturityAt");

-- AddForeignKey
ALTER TABLE "StakePosition" ADD CONSTRAINT "StakePosition_renewedIntoPositionId_fkey" FOREIGN KEY ("renewedIntoPositionId") REFERENCES "StakePosition"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
