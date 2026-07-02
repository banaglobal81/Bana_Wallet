-- AlterTable
ALTER TABLE "StakePosition" ADD COLUMN     "daysPaid" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paidInterest" TEXT NOT NULL DEFAULT '0';

-- CreateTable
CREATE TABLE "StakingPayout" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "coin" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StakingPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StakingPayout_userId_idx" ON "StakingPayout"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StakingPayout_positionId_dayIndex_key" ON "StakingPayout"("positionId", "dayIndex");

-- AddForeignKey
ALTER TABLE "StakingPayout" ADD CONSTRAINT "StakingPayout_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "StakePosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
