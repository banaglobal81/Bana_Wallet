import 'server-only';

import { auth } from '@/auth';
import { NIA_DEFAULT_USER_ID } from './config';

/**
 * Nia-Hub end-user id for the CURRENTLY LOGGED-IN user.
 * Identity is derived exclusively from the server-side session.
 * Never trusts client-supplied userId in query params or request body.
 */
export async function resolveSessionUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  return (session.user as { niaUserId?: string | null }).niaUserId ?? NIA_DEFAULT_USER_ID;
}
