import 'server-only';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

export async function requireUser() {
  const s = await auth();
  if (!s?.user) throw Object.assign(new Error('Unauthorized'), { status: 401 });

  // Remote log-out: if this token carries a session id (sid) but its LoginSession
  // row is gone, the device was revoked from "My Devices" → reject. Fail-open:
  // tokens without a sid (issued before this feature) and transient DB errors are
  // allowed through, so this can never lock the whole app out.
  const sid = s.sid;
  if (sid) {
    try {
      const alive = await prisma.loginSession.findUnique({ where: { id: sid }, select: { id: true } });
      if (!alive) throw Object.assign(new Error('Session signed out'), { status: 401 });
    } catch (e) {
      if ((e as { status?: number }).status === 401) throw e;
      // DB unreachable → don't lock the user out over a transient error.
    }
  }
  return s.user;
}

export async function requireAdmin() {
  const u = await requireUser();
  if ((u as any).role !== 'ADMIN') throw Object.assign(new Error('Forbidden'), { status: 403 });
  return u;
}
