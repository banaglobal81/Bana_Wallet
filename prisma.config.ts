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
