import 'server-only';
import { randomUUID } from 'node:crypto';

/**
 * Generate a stable, unique Nia-Hub end-user id for a new BANA account.
 *
 * Nia-Hub is a B2B/broker integration: there is no "create user" call. The
 * broker simply sends a stable `userId` string per end-user, and Nia scopes
 * that user's wallets/balances under our tenant. We mint one opaque id per
 * account at sign-up and persist it on `User.niaUserId`, so every user maps to
 * their own Nia sub-account instead of sharing NIA_DEFAULT_USER_ID.
 *
 * The `bana_` prefix makes the id easy to recognize in Nia-Hub dashboards/logs.
 */
export function newNiaUserId(): string {
  return `bana_${randomUUID()}`;
}
