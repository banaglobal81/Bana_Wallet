-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'FAILED');

-- CreateTable
CREATE TABLE "WithdrawalRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "niaUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "hubTxId" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WithdrawalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WithdrawalRequest_status_createdAt_idx" ON "WithdrawalRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "WithdrawalRequest_userId_createdAt_idx" ON "WithdrawalRequest"("userId", "createdAt");
