import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

// docs/specs/staking-yield-system-v2-design-t8-stake-flow-frd.md / T-9 (CUT-4)
// — seeds a deterministic test user + a V2 staking product + a back-dated V2
// position so the Staking page shows a real recorded position. V2-CORE only
// ever stakes BANA (N-6: "only BANA is stakeable"), and BANA is
// LOCAL-authority, so this fixture also seeds the `ManagedCoin` row + the
// `UserCoinBalance`/`LocalBalanceHold` pair a real stake creates (`placeHold`
// inside `createStakePositionV2`) — the legacy fixture staked USDT against
// the hub-balance model, which the V2 stake route no longer accepts at all
// (non-LOCAL coins 503 `STAKE_COIN_AUTHORITY_UNSUPPORTED`). Idempotent: prior
// runs' artifacts are cleared first, in FK-safe order. (Named "E2E …" so it's
// easy to spot/remove.)
export const E2E = {
  email: 'e2e-staking@example.com',
  password: 'e2e-testpass-123',
  productName: 'E2E BANA 90-Day',
  coin: 'BANA',
  principal: '5000',
  rate: '0.7', // %/day (baseDailyRatePct)
  elapsedDays: 5, // → ledgeredYield stays "0" until the daily worker actually runs (R-U7)
};

// A deterministic ADMIN used by the admin-pages E2E (admin.spec.ts).
export const E2E_ADMIN = {
  email: 'e2e-admin@example.com',
  password: 'e2e-adminpass-123',
};

const DAY = 86_400_000;
const cuid = () => 'c' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);

export default async function globalSetup() {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query("SET TIME ZONE 'UTC'");

  // Clean prior artifacts — FK-safe order (StakeYieldLedgerEntry references
  // StakePositionV2; LocalBalanceHold/UserCoinBalance/LocalLedgerEntry are
  // loose references keyed by userId, no hard FK, but still cleaned before
  // the User row so a re-run never accumulates duplicate holds/balances).
  const priorUser = await c.query('SELECT id FROM "User" WHERE email=$1', [E2E.email]);
  const priorUserId: string | undefined = priorUser.rows[0]?.id;
  if (priorUserId) {
    await c.query(
      'DELETE FROM "StakeYieldLedgerEntry" WHERE "positionId" IN (SELECT id FROM "StakePositionV2" WHERE "userId"=$1)',
      [priorUserId],
    );
    await c.query('DELETE FROM "StakePositionV2" WHERE "userId"=$1', [priorUserId]);
    await c.query('DELETE FROM "LocalBalanceHold" WHERE "userId"=$1', [priorUserId]);
    await c.query('DELETE FROM "LocalLedgerEntry" WHERE "userId"=$1', [priorUserId]);
    await c.query('DELETE FROM "UserCoinBalance" WHERE "userId"=$1', [priorUserId]);
  }
  await c.query('DELETE FROM "User" WHERE email=$1', [E2E.email]);

  // Admin user for the admin-pages E2E (upsert to a known password).
  await c.query('DELETE FROM "User" WHERE email=$1', [E2E_ADMIN.email]);
  const adminHash = await bcrypt.hash(E2E_ADMIN.password, 12);
  await c.query(
    'INSERT INTO "User"(id,email,"passwordHash",role,"createdAt") VALUES($1,$2,$3,$4,now())',
    [cuid(), E2E_ADMIN.email, adminHash, 'ADMIN'],
  );
  console.log(`[e2e] seeded ADMIN ${E2E_ADMIN.email}`);
  await c.query('DELETE FROM "StakingProductV2" WHERE name=$1', [E2E.productName]);

  // ManagedCoin(BANA) — must be LOCAL-authority + CLEAR alert stage for the
  // stake route's `getCoinAuthority`/`assertExecutionAllowed` checks to pass
  // and for `/api/wallet/local-balance` to serve a row for it at all. Upsert
  // (not delete+insert) — other suites/dev seeding may already own this row,
  // and it is shared platform config, not per-test-user data.
  await c.query(
    `INSERT INTO "ManagedCoin"(id,symbol,name,networks,visible,"balanceAuthority","authorityAlertStage","createdAt","updatedAt")
     VALUES($1,$2,$3,$4::jsonb,true,'LOCAL','CLEAR',now(),now())
     ON CONFLICT (symbol) DO UPDATE SET "balanceAuthority"='LOCAL', "authorityAlertStage"='CLEAR', "directAuthorityChangeInProgress"=false`,
    [cuid(), E2E.coin, E2E.coin, '[]'],
  );

  // User (with a real bcrypt password so it logs in through the form).
  const uid = cuid();
  const niaUid = 'bana_' + crypto.randomUUID();
  const hash = await bcrypt.hash(E2E.password, 12);
  await c.query(
    'INSERT INTO "User"(id,email,"passwordHash",role,"niaUserId","createdAt") VALUES($1,$2,$3,$4,$5,now())',
    [uid, E2E.email, hash, 'USER', niaUid],
  );

  // Product (90-day, 0.7%/day BANA, CP-5′-shaped: minAmount/maxAmount/capacity
  // all non-null). `status='OPEN'` — CS-2′/CP-5′'s "every real product is
  // CLOSED in production" doesn't apply to this isolated E2E fixture.
  const pid = cuid();
  await c.query(
    `INSERT INTO "StakingProductV2"(id,coin,name,"termDays","baseDailyRatePct","minAmount","maxAmount",capacity,status,"createdAt","updatedAt")
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),now())`,
    [pid, E2E.coin, E2E.productName, 90, E2E.rate, '100', '9999', '100000', 'OPEN'],
  );

  // UserCoinBalance — the position's principal, as a real local-ledger
  // balance (not a legacy hub row). Set equal to the principal so `available`
  // reads "0" once the matching hold below locks it — the same shape a real
  // `createStakePositionV2` call leaves behind.
  await c.query(
    'INSERT INTO "UserCoinBalance"(id,"userId",coin,balance,version,"updatedAt","createdAt") VALUES($1,$2,$3,$4,0,now(),now())',
    [cuid(), uid, E2E.coin, E2E.principal],
  );

  // Back-dated V2 position (+12h buffer keeps the whole-day count
  // deterministic) — ACTIVE, `fundingSource='USER_BALANCE'`,
  // `ledgeredYield='0'`/`daysPaid=0` (the daily settlement worker hasn't run
  // in this fixture, matching R-U7: recorded yield is never a live
  // projection).
  const posId = cuid();
  const holdId = cuid();
  const startAt = new Date(Date.now() - (E2E.elapsedDays * DAY + DAY / 2));
  const maturityAt = new Date(startAt.getTime() + 90 * DAY);
  await c.query(
    `INSERT INTO "StakePositionV2"(
       id,"userId",email,"niaUserId","productId",coin,principal,"baseDailyRatePct","termDays",
       "startAt","maturityAt",status,"fundingSource","principalHoldId","ledgeredYield","daysPaid","createdAt"
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now())`,
    [
      posId, uid, E2E.email, niaUid, pid, E2E.coin, E2E.principal, E2E.rate, 90,
      startAt, maturityAt, 'ACTIVE', 'USER_BALANCE', holdId, '0', 0,
    ],
  );

  // STAKE_PRINCIPAL_LOCK hold — the same row `placeHold` would have created;
  // this is what `/api/wallet/local-balance`'s `holds.stakePrincipal` and
  // `lockedPrincipalByCoin` (the withdrawal-lock source of truth) both sum.
  await c.query(
    `INSERT INTO "LocalBalanceHold"(id,"userId",coin,amount,"reasonCode",status,"relatedType","relatedId","createdAt")
     VALUES($1,$2,$3,$4,'STAKE_PRINCIPAL_LOCK','ACTIVE','STAKE_POSITION',$5,now())`,
    [holdId, uid, E2E.coin, E2E.principal, posId],
  );

  await c.end();
  console.log(`[e2e] seeded ${E2E.email} + ${E2E.productName} + position (${E2E.principal} ${E2E.coin} @${E2E.rate}%/day, ${E2E.elapsedDays}d elapsed)`);
}
