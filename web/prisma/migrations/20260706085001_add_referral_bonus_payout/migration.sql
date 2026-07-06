-- CreateTable
CREATE TABLE "ReferralBonusPayout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "coin" TEXT NOT NULL DEFAULT 'BANA',
    "layer1" TEXT NOT NULL DEFAULT '0',
    "layer2" TEXT NOT NULL DEFAULT '0',
    "total" TEXT NOT NULL DEFAULT '0',
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralBonusPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReferralBonusPayout_userId_idx" ON "ReferralBonusPayout"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralBonusPayout_userId_dayKey_key" ON "ReferralBonusPayout"("userId", "dayKey");

