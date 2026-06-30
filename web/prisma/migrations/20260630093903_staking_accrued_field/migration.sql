-- AlterTable
ALTER TABLE "StakePosition" ADD COLUMN     "accruedInterest" TEXT NOT NULL DEFAULT '0',
ADD COLUMN     "lastAccrualAt" TIMESTAMP(3);
