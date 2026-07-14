// Load .env with dotenv (lenient, same loader Next uses). A standalone tsx/node
// script does NOT auto-load .env, so this must run before reading process.env.
// dotenv logs "injected env (N) from .env" — useful to confirm it found the file.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Mirror src/lib/nia/identity.ts's `bana_<uuid>` format (that module is
// `server-only`, so the seed can't import it). Every account needs a Nia-Hub
// end-user id — without one, wallet routes fail closed with 403.
const newNiaUserId = () => `bana_${randomUUID()}`;

// Prisma 7 requires a driver adapter (the URL is no longer read from the schema
// or a constructor option). Mirror src/lib/db.ts here (seed can't import that
// module because it's marked `server-only`).
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const rawEmail = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!rawEmail || !password) {
    throw new Error(
      'ADMIN_EMAIL and ADMIN_PASSWORD are required but were not loaded.\n' +
        `  ADMIN_EMAIL set: ${Boolean(rawEmail)} | ADMIN_PASSWORD set: ${Boolean(password)} | ` +
        `DATABASE_URL set: ${Boolean(process.env.DATABASE_URL)}\n` +
        '  Check that .env exists at the project root, is SAVED, and contains these keys. ' +
        'If dotenv did not print "injected env (...) from .env" above, the file was not found.',
    );
  }

  const email = rawEmail.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: 'ADMIN' },
    create: { email, passwordHash, role: 'ADMIN', niaUserId: newNiaUserId() },
  });
  // Backfill for an admin seeded before per-user Nia ids existed (would 403 on
  // wallet routes otherwise). niaUserId is unique + stable once set.
  if (!admin.niaUserId) {
    await prisma.user.update({ where: { id: admin.id }, data: { niaUserId: newNiaUserId() } });
  }

  console.log(`Seeded ADMIN: ${email}`);

  await seedBanaCoin();
}

// Seed the BANA managed coin with its CURRENT (신/new) contract address, so a
// fresh database starts with the right token. Create-if-missing ONLY: if a BANA
// row already exists (e.g. production), this leaves it untouched — update the
// live contract address through Admin → Coins, not here.
//
// NOTE: verify these values match the deployed token. Decimals for most BEP20
// tokens are 18; the network code should match what you use in Admin → Coins.
async function seedBanaCoin() {
  const BANA_CONTRACT = '0x154a8Ca29526184D1A3a02f047e4127FD14156b9'; // 신 (new)
  const networks = [
    {
      code: 'BINANCE',
      contractAddress: BANA_CONTRACT,
      decimals: 18,
      depositEnabled: true,
      withdrawEnabled: true,
    },
  ];

  const coin = await prisma.managedCoin.upsert({
    where: { symbol: 'BANA' },
    update: {}, // never clobber an existing (possibly live) BANA row
    create: { symbol: 'BANA', name: 'BANA', networks, logoKey: null, visible: true },
  });
  console.log(`Seeded managed coin BANA (contract ${BANA_CONTRACT}) — id ${coin.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
