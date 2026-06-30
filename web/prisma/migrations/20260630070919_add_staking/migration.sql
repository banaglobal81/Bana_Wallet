-- CreateEnum
CREATE TYPE "StakingProductStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "StakePositionStatus" AS ENUM ('ACTIVE', 'MATURED', 'PAID');

-- CreateTable
CREATE TABLE "StakingProduct" (
    "id" TEXT NOT NULL,
    "coin" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "termDays" INTEGER NOT NULL,
    "dailyRatePct" TEXT NOT NULL,
    "minAmount" TEXT,
    "maxAmount" TEXT,
    "capacity" TEXT,
    "status" "StakingProductStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StakingProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StakePosition" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "niaUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "coin" TEXT NOT NULL,
    "principal" TEXT NOT NULL,
    "dailyRatePct" TEXT NOT NULL,
    "termDays" INTEGER NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "maturityAt" TIMESTAMP(3) NOT NULL,
    "status" "StakePositionStatus" NOT NULL DEFAULT 'ACTIVE',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StakePosition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StakingProduct_status_idx" ON "StakingProduct"("status");

-- CreateIndex
CREATE INDEX "StakePosition_userId_status_idx" ON "StakePosition"("userId", "status");

-- CreateIndex
CREATE INDEX "StakePosition_status_idx" ON "StakePosition"("status");

-- AddForeignKey
ALTER TABLE "StakePosition" ADD CONSTRAINT "StakePosition_productId_fkey" FOREIGN KEY ("productId") REFERENCES "StakingProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
