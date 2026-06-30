import 'server-only';
import { auth } from '@/auth';

export async function requireUser() {
  const s = await auth();
  if (!s?.user) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  return s.user;
}

export async function requireAdmin() {
  const u = await requireUser();
  if ((u as any).role !== 'ADMIN') throw Object.assign(new Error('Forbidden'), { status: 403 });
  return u;
}
