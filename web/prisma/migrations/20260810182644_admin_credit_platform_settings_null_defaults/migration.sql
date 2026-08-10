-- AlterTable
ALTER TABLE "PlatformSetting" ALTER COLUMN "adminCreditCumulativeCap" DROP DEFAULT,
ALTER COLUMN "adminCreditMaxPerDay" DROP DEFAULT,
ALTER COLUMN "adminCreditMaxPerTx" DROP DEFAULT,
ALTER COLUMN "maxInterestLiabilityCapBana" DROP DEFAULT;

-- Data fix: reset any rows already backfilled with the previous migration's
-- non-null defaults (5000 / 20000 / 100000 / 10000) back to the fail-closed
-- NULL state. wallet-security-expert T-17 final review: those values were
-- asserted only by an agent's own narrative ("master-approved") and cannot be
-- independently verified, so they must not persist as live data either. No
-- arithmetic here, so no decimal.js is needed (rule 2 scope).
UPDATE "PlatformSetting" SET
  "adminCreditMaxPerTx" = NULL,
  "adminCreditMaxPerDay" = NULL,
  "adminCreditCumulativeCap" = NULL,
  "maxInterestLiabilityCapBana" = NULL;
