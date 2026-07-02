// Seed the standard staking products for BOTH coins (USDT + BANA Token).
// Run: `npm run db:seed:staking`. Idempotent — skips any (coin, term) that
// already exists, so it never duplicates or overwrites admin-edited products.
//
// USDT amounts are from the deck. BANA amounts are a STARTING SUGGESTION
// (≈10× USDT) and the 360-day rate is a placeholder — both need the senior's
// policy confirmation. Rates are identical for both coins for now.
import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const LOCKS = [
  { termDays: 10, rate: '0.2', usdt: ['100', '300'], bana: ['1000', '3000'] },
  { termDays: 30, rate: '0.5', usdt: ['301', '2999'], bana: ['3001', '29999'] },
  { termDays: 90, rate: '0.7', usdt: ['3000', '9999'], bana: ['30000', '99999'] },
  { termDays: 180, rate: '1.0', usdt: ['10000', '50000'], bana: ['100000', '500000'] },
  { termDays: 360, rate: '1.3', usdt: ['50001', '100000'], bana: ['500001', '1000000'] }, // 360 rate = placeholder (TBD)
] as const;

async function main() {
  let created = 0;
  let skipped = 0;
  for (const coin of ['USDT', 'BANA'] as const) {
    for (const l of LOCKS) {
      const [minAmount, maxAmount] = coin === 'USDT' ? l.usdt : l.bana;
      const exists = await prisma.stakingProduct.findFirst({ where: { coin, termDays: l.termDays } });
      if (exists) { skipped += 1; continue; }
      await prisma.stakingProduct.create({
        data: { coin, name: `${coin} ${l.termDays}-Day`, termDays: l.termDays, dailyRatePct: l.rate, minAmount, maxAmount, status: 'OPEN' },
      });
      created += 1;
    }
  }
  console.log(`Staking products: ${created} created, ${skipped} already existed (USDT + BANA × ${LOCKS.length} locks).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => pool.end());
