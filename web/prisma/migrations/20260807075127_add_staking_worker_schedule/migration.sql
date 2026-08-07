-- AlterTable
ALTER TABLE "PlatformSetting" ADD COLUMN     "stakingWorkerDailyTime" TEXT NOT NULL DEFAULT '00:00',
ADD COLUMN     "stakingWorkerEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "stakingWorkerIntervalMinutes" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "stakingWorkerMode" TEXT NOT NULL DEFAULT 'INTERVAL';
