import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

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
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required');
  }

  const email = rawEmail.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: 'ADMIN' },
    create: { email, passwordHash, role: 'ADMIN' },
  });

  console.log(`Seeded ADMIN: ${email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
