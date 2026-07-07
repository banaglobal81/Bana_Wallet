import 'server-only';

import { requireUser } from '@/lib/auth/session';

/**
 * Nia-Hub end-user id for the CURRENTLY LOGGED-IN user.
 *
 * Identity is derived exclusively from the server-side session, via requireUser()
 * — so a session revoked from "My Devices" (its LoginSession row deleted) is
 * rejected here too, not just on requireUser routes. Never trusts a client-supplied
 * userId in query params or request body.
 *
 * Fails CLOSED: if the account has no per-user niaUserId it must NOT fall back to a
 * shared/default account (that would expose another account's balances + withdrawal
 * authority). A missing niaUserId is a 403, not a silent share.
 */
export async function resolveSessionUserId(): Promise<string> {
  const user = (await requireUser()) as { niaUserId?: string | null };
  const id = user.niaUserId;
  if (!id) throw Object.assign(new Error('This account is not provisioned for wallet access.'), { status: 403 });
  return id;
}
