-- CreateTable
CREATE TABLE "WithdrawalAddress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WithdrawalAddress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WithdrawalAddress_userId_createdAt_idx" ON "WithdrawalAddress"("userId", "createdAt");
