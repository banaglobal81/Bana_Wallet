import 'server-only';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// Lazy, HMR-safe Prisma singleton.
//
// Prisma 7 architecture: PrismaClient no longer accepts a connection URL
// directly (datasourceUrl / datasources options are gone). The only supported
// runtime connection mechanisms are a driver adapter or Prisma Accelerate.
// We use @prisma/adapter-pg (official pg driver adapter) so that a plain
// postgresql:// DATABASE_URL works without Accelerate.
//
// The entire construction (Pool → PrismaPg adapter → PrismaClient) is deferred
// inside the Proxy getter, so importing this module during `next build` — where
// DATABASE_URL is not set — does NOT construct anything and does NOT throw.
// The client is only constructed on the first real property access (a query),
// which never occurs during build-time static-analysis passes.

const g = globalThis as unknown as { _prisma?: PrismaClient };

function getClient(): PrismaClient {
  if (!g._prisma) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    g._prisma = new PrismaClient({ adapter });
  }
  return g._prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient() as object, prop, receiver);
  },
});
