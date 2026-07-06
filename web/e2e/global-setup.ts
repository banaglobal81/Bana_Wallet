import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

// Seed a deterministic test user + one OPEN staking product + a back-dated
// position so the Staking page shows real accrued interest. Idempotent: prior
// runs' artifacts are cleared first. (Named "E2E …" so it's easy to spot/remove.)
export const E2E = {
  email: 'e2e-staking@example.com',
  password: 'e2e-testpass-123',
  productName: 'E2E USDT 90-Day',
  principal: '5000',
  rate: '0.7', // %/day
  elapsedDays: 5, // → accrued = 5000 × 0.7% × 5 = 175 USDT
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

  // Clean prior artifacts.
  await c.query('DELETE FROM "StakingPayout" WHERE "userId" IN (SELECT id FROM "User" WHERE email=$1)', [E2E.email]);
  await c.query('DELETE FROM "StakePosition" WHERE email=$1', [E2E.email]);
  await c.query('DELETE FROM "User" WHERE email=$1', [E2E.email]);

  // Admin user for the admin-pages E2E (upsert to a known password).
  await c.query('DELETE FROM "User" WHERE email=$1', [E2E_ADMIN.email]);
  const adminHash = await bcrypt.hash(E2E_ADMIN.password, 12);
  await c.query(
    'INSERT INTO "User"(id,email,"passwordHash",role,"createdAt") VALUES($1,$2,$3,$4,now())',
    [cuid(), E2E_ADMIN.email, adminHash, 'ADMIN'],
  );
  console.log(`[e2e] seeded ADMIN ${E2E_ADMIN.email}`);
  await c.query('DELETE FROM "StakingProduct" WHERE name=$1', [E2E.productName]);

  // User (with a real bcrypt password so it logs in through the form).
  const uid = cuid();
  const niaUid = 'bana_' + crypto.randomUUID();
  const hash = await bcrypt.hash(E2E.password, 12);
  await c.query(
    'INSERT INTO "User"(id,email,"passwordHash",role,"niaUserId","createdAt") VALUES($1,$2,$3,$4,$5,now())',
    [uid, E2E.email, hash, 'USER', niaUid],
  );

  // Product (90-day, 0.7%/day, 3000–9999 USDT).
  const pid = cuid();
  await c.query(
    'INSERT INTO "StakingProduct"(id,coin,name,"termDays","dailyRatePct","minAmount","maxAmount",status,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,now(),now())',
    [pid, 'USDT', E2E.productName, 90, E2E.rate, '3000', '9999', 'OPEN'],
  );

  // Back-dated position (+12h buffer keeps the whole-day count deterministic).
  const posId = cuid();
  const startAt = new Date(Date.now() - (E2E.elapsedDays * DAY + DAY / 2));
  const maturityAt = new Date(startAt.getTime() + 90 * DAY);
  await c.query(
    'INSERT INTO "StakePosition"(id,"userId","niaUserId",email,"productId",coin,principal,"dailyRatePct","termDays","startAt","maturityAt",status,"accruedInterest","paidInterest","daysPaid","createdAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now())',
    [posId, uid, niaUid, E2E.email, pid, 'USDT', E2E.principal, E2E.rate, 90, startAt, maturityAt, 'ACTIVE', '0', '0', 0],
  );

  await c.end();
  console.log(`[e2e] seeded ${E2E.email} + ${E2E.productName} + position (${E2E.principal} @${E2E.rate}%/day, ${E2E.elapsedDays}d elapsed)`);
}
