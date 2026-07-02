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

/**
 * Request a password-reset email. Always resolves (the server responds
 * identically whether or not the email has an account — no enumeration), so the
 * UI should always show the same "if an account exists, check your email" notice.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  await fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email }),
  }).catch(() => {});
}

/**
 * Complete a password reset with the emailed token. Resolves on success, throws
 * with the server's message (e.g. "Invalid or expired reset link") on failure.
 */
export async function resetPassword(token: string, password: string): Promise<void> {
  const res = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ token, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) {
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
}

// ---- Withdrawal address book ----

export interface SavedAddress {
  id: string;
  label: string;
  network: string;
  address: string;
  createdAt: string;
}

/** List the current user's saved withdrawal addresses. */
export async function listSavedAddresses(): Promise<SavedAddress[]> {
  try {
    const res = await fetch('/api/user/withdrawal-addresses', { headers: { Accept: 'application/json' } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.ok === false) return [];
    return Array.isArray(body.data) ? body.data : [];
  } catch {
    return [];
  }
}

/** Save a new withdrawal address. Throws with the server message on failure. */
export async function addSavedAddress(input: { label: string; network: string; address: string }): Promise<SavedAddress> {
  const res = await fetch('/api/user/withdrawal-addresses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) throw new Error(body?.error || `Request failed (${res.status})`);
  return body.data as SavedAddress;
}

/** Delete a saved withdrawal address. */
export async function deleteSavedAddress(id: string): Promise<void> {
  const res = await fetch(`/api/user/withdrawal-addresses/${id}`, { method: 'DELETE', headers: { Accept: 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) throw new Error(body?.error || `Request failed (${res.status})`);
}

// ---- Two-factor authentication (TOTP / Google Authenticator) ----

export interface TwoFAStatus { enabled: boolean; backupCodesRemaining: number; }

async function twofa<T>(path: string, method: 'GET' | 'POST', payload?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: method === 'POST' ? JSON.stringify(payload ?? {}) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) throw new Error(body?.error || `Request failed (${res.status})`);
  return body.data as T;
}

/** Current 2FA status for the signed-in user. */
export function get2faStatus(): Promise<TwoFAStatus> {
  return twofa<TwoFAStatus>('/api/auth/2fa', 'GET');
}

/** Begin enrollment — returns the base32 secret + otpauth URI for the QR. */
export function setup2fa(): Promise<{ secret: string; otpauthUri: string }> {
  return twofa('/api/auth/2fa/setup', 'POST');
}

/** Verify the first code and activate 2FA — returns one-time backup codes. */
export function enable2fa(code: string): Promise<{ backupCodes: string[] }> {
  return twofa('/api/auth/2fa/enable', 'POST', { code });
}

/** Turn off 2FA (requires a current or backup code). */
export async function disable2fa(code: string): Promise<void> {
  await twofa('/api/auth/2fa/disable', 'POST', { code });
}

// ---- Email change (verified) ----

/** Send a 6-digit verification code to the NEW email address. */
export async function requestEmailChange(newEmail: string): Promise<void> {
  const res = await fetch('/api/auth/email/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ newEmail }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) throw new Error(body?.error || `Request failed (${res.status})`);
}

/** Confirm the code and switch the account email. Returns the new email. */
export async function verifyEmailChange(code: string): Promise<{ email: string }> {
  const res = await fetch('/api/auth/email/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ code }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) throw new Error(body?.error || `Request failed (${res.status})`);
  return body.data as { email: string };
}
