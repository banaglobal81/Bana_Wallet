-- AlterTable: add account-disable flag (nullable default — additive, no rewrite/lock)
ALTER TABLE "User" ADD COLUMN "disabled" BOOLEAN NOT NULL DEFAULT false;
