import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/types';

// Client for WebAuthn passkeys (biometric). Identity is the server session.
export interface PasskeyInfo {
  id: string;
  deviceName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

async function req<T>(path: string, method: string, payload?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: method === 'POST' ? JSON.stringify(payload ?? {}) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) throw new Error(body?.error || `Request failed (${res.status})`);
  return body.data as T;
}

/** True if this browser/device can do WebAuthn (needed to show the UI). */
export function passkeysSupported(): boolean {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential;
}

/** The user's registered passkeys ("My devices"). */
export function listPasskeys(): Promise<PasskeyInfo[]> {
  return req<PasskeyInfo[]>('/api/auth/passkeys', 'GET');
}

/** Remove one passkey. */
export function deletePasskey(id: string): Promise<void> {
  return req<void>(`/api/auth/passkeys/${id}`, 'DELETE');
}

/** Register a new biometric passkey on this device (prompts Face ID/fingerprint). */
export async function registerPasskey(deviceName: string): Promise<void> {
  const options = await req<PublicKeyCredentialCreationOptionsJSON>('/api/auth/passkeys/register/options', 'POST');
  const response = await startRegistration(options);
  await req<void>('/api/auth/passkeys/register/verify', 'POST', { response, deviceName });
}

/**
 * Prompt the device biometric and return the signed assertion (JSON string) to
 * hand to signIn('passkey', { response }). Used for passwordless login.
 */
export async function getPasskeyAssertion(): Promise<string> {
  const options = await req<PublicKeyCredentialRequestOptionsJSON>('/api/auth/passkeys/authenticate/options', 'POST');
  const assertion = await startAuthentication(options);
  return JSON.stringify(assertion);
}
