-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailChangeCodeHash" TEXT,
ADD COLUMN     "emailChangeExpiry" TIMESTAMP(3),
ADD COLUMN     "emailChangedAt" TIMESTAMP(3),
ADD COLUMN     "pendingEmail" TEXT,
ADD COLUMN     "previousEmail" TEXT,
ADD COLUMN     "previousEmailBlockedUntil" TIMESTAMP(3);
