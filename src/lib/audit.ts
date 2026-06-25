import 'server-only';
import { prisma } from '@/lib/db';

/**
 * Record an admin action for the audit log. Best-effort — never throws, so a
 * logging failure can't break the underlying action.
 */
export async function recordAudit(opts: {
  adminId?: string | null;
  adminEmail?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: string;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        adminId: opts.adminId ?? null,
        adminEmail: opts.adminEmail ?? 'unknown',
        action: opts.action,
        targetType: opts.targetType ?? null,
        targetId: opts.targetId ?? null,
        detail: opts.detail ?? null,
      },
    });
  } catch (e) {
    console.error('[audit] failed to record action', opts.action, e);
  }
}
