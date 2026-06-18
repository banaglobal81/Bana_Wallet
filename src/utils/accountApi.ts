// Frontend client for account/auth endpoints (session-scoped). These talk to our
// own /api/auth/* routes; identity is derived from the server session, never the client.

export interface AccountInfo {
  email: string;
  role: 'USER' | 'ADMIN';
  authMethod: 'password' | 'google';
  createdAt: string;
}

/** Current user's account info (email, role, auth method). */
export async function getAccount(): Promise<AccountInfo> {
  const res = await fetch('/api/auth/account', { headers: { Accept: 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) {
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  return body.data as AccountInfo;
}

/**
 * Change the current user's password. Resolves on success, throws with the
 * server's error message (e.g. "Current password is incorrect") on failure.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await fetch('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) {
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
}
