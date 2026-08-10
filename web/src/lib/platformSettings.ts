import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

type PlatformSettingsClient = typeof prisma | Prisma.TransactionClient;

/**
 * The single platform-policy row, created with defaults on first access.
 *
 * Accepts an optional Prisma transaction client so a caller that needs to read
 * this under an advisory lock (e.g. CP-10's interest-liability-cap check in
 * products/[id]/route.ts — wallet-security-expert review, rev05 CUT-2) can read
 * it inside the SAME transaction as the lock + the write it's guarding, instead
 * of a separate connection that could see a stale value.
 */
export async function getPlatformSettings(client: PlatformSettingsClient = prisma) {
  const existing = await client.platformSetting.findUnique({ where: { id: 'singleton' } });
  if (existing) return existing;
  return client.platformSetting.create({ data: { id: 'singleton' } });
}
