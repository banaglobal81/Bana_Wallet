-- Backfill: give every existing account without a Nia end-user id a unique one,
-- so no user keeps falling back to the shared NIA_DEFAULT_USER_ID. Matches the
-- `bana_<uuid>` format minted at sign-up in src/lib/nia/identity.ts.
UPDATE "User"
SET "niaUserId" = 'bana_' || gen_random_uuid()
WHERE "niaUserId" IS NULL;

-- Enforce a one-to-one mapping between BANA accounts and Nia sub-accounts.
CREATE UNIQUE INDEX "User_niaUserId_key" ON "User"("niaUserId");
