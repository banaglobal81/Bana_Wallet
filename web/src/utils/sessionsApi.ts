// Client for login-session ("My Devices") management. Identity is the session.
export interface DeviceSession {
  id: string;
  device: string;
  ip: string | null;
  city: string | null;
  country: string | null;
  createdAt: string;
  current: boolean;
}

/** List the user's active login sessions (current first-flagged). */
export async function listSessions(): Promise<DeviceSession[]> {
  const res = await fetch('/api/auth/sessions', { headers: { Accept: 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) throw new Error(body?.error || `Request failed (${res.status})`);
  return body.data as DeviceSession[];
}

/** Log out one device/session. */
export async function revokeSession(id: string): Promise<void> {
  const res = await fetch(`/api/auth/sessions/${id}`, { method: 'DELETE', headers: { Accept: 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) throw new Error(body?.error || `Request failed (${res.status})`);
}
