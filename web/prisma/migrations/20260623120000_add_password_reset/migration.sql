-- AlterTable: add password-reset token columns (nullable, additive — no rewrite/lock)
ALTER TABLE "User" ADD COLUMN "resetTokenHash" TEXT;
ALTER TABLE "User" ADD COLUMN "resetTokenExpiry" TIMESTAMP(3);
