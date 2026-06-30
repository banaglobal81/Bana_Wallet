import 'server-only';
import { prisma } from '@/lib/db';

/** The single platform-policy row, created with defaults on first access. */
export async function getPlatformSettings() {
  const existing = await prisma.platformSetting.findUnique({ where: { id: 'singleton' } });
  if (existing) return existing;
  return prisma.platformSetting.create({ data: { id: 'singleton' } });
}
