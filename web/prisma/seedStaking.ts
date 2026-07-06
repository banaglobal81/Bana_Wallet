// Seed the standard staking products — **BANA only** (per policy: only the BANA
// token is stakeable). Run: `npm run db:seed:staking`.
//
// Idempotent + self-healing:
//   • creates any missing BANA tier,
//   • removes any non-BANA product (e.g. legacy USDT) that has NO positions,
//   • if a non-BANA product still has positions, it is CLOSED (not deleted) so
//     existing stakes keep running to maturity but no new stakes are allowed.
//
// BANA amounts + the 360-day rate are placeholders pending the senior's policy.
import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const LOCKS = [
  { termDays: 10, rate: '0.2', bana: ['1000', '3000'] },
  { termDays: 30, rate: '0.5', bana: ['3001', '29999'] },
  { termDays: 90, rate: '0.7', bana: ['30000', '99999'] },
  { termDays: 180, rate: '1.0', bana: ['100000', '500000'] },
  { termDays: 360, rate: '1.3', bana: ['500001', '1000000'] }, // 360 rate = placeholder (TBD)
] as const;

async function main() {
  let created = 0;
  let skipped = 0;

  // 1) Ensure the BANA tiers exist.
  for (const l of LOCKS) {
    const [minAmount, maxAmount] = l.bana;
    const exists = await prisma.stakingProduct.findFirst({ where: { coin: 'BANA', termDays: l.termDays } });
    if (exists) { skipped += 1; continue; }
    await prisma.stakingProduct.create({
      data: { coin: 'BANA', name: `BANA ${l.termDays}-Day`, termDays: l.termDays, dailyRatePct: l.rate, minAmount, maxAmount, status: 'OPEN' },
    });
    created += 1;
  }

  // 2) Enforce BANA-only: drop any other coin's products (e.g. USDT).
  const others = await prisma.stakingProduct.findMany({
    where: { coin: { not: 'BANA' } },
    select: { id: true, coin: true, name: true },
  });
  let removed = 0;
  let closed = 0;
  for (const p of others) {
    const positions = await prisma.stakePosition.count({ where: { productId: p.id } });
    if (positions > 0) {
      // Never delete money-bearing records — just stop new stakes.
      await prisma.stakingProduct.update({ where: { id: p.id }, data: { status: 'CLOSED' } });
      closed += 1;
      console.warn(`Kept ${p.coin} "${p.name}" (${positions} positions) — set to CLOSED instead of deleting.`);
      continue;
    }
    await prisma.stakingProduct.delete({ where: { id: p.id } });
    removed += 1;
  }

  console.log(`Staking (BANA-only): ${created} created, ${skipped} already existed; removed ${removed} non-BANA product(s), closed ${closed} with positions.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => pool.end());
