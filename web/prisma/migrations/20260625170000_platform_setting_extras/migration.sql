-- AlterTable: more platform controls (all additive, with safe defaults)
ALTER TABLE "PlatformSetting" ADD COLUMN "maintenanceMode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PlatformSetting" ADD COLUMN "dailyWithdrawalLimitUsd" TEXT;
ALTER TABLE "PlatformSetting" ADD COLUMN "signupsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PlatformSetting" ADD COLUMN "supportEmail" TEXT;
ALTER TABLE "PlatformSetting" ADD COLUMN "displayName" TEXT;
