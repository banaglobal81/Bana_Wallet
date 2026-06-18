// Load .env so the Prisma CLI (migrate/deploy/status) sees DATABASE_URL — Prisma 7
// with prisma.config.ts does NOT auto-load .env. This is a no-op (no throw) when
// .env is absent, so `prisma generate` during build/CI still works without a DB.
import 'dotenv/config';
import { defineConfig } from '@prisma/config';

// Prisma 7 breaking change: connection URL is declared here (not in schema.prisma).
// We use process.env directly (not the strict env() helper) so that
// `prisma generate` — which does NOT need a DB connection — can load this
// config without DATABASE_URL being set in the environment.
// At migration / runtime time DATABASE_URL must be set.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
