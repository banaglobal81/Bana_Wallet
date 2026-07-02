export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { rpFromRequest } from '@/lib/webauthn';

// POST /api/auth/passkeys/authenticate/options — start passwordless passkey
// login. No session required (this IS the login). Uses discoverable credentials
// (the passkey identifies the user), requires biometric/PIN, and stashes the
// challenge in a short-lived httpOnly cookie for the verify step.
export async function POST(req: Request) {
  const { rpID } = rpFromRequest(req);
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'required',
  });

  const res = NextResponse.json({ ok: true, data: options });
  res.cookies.set('webauthn_auth_challenge', options.challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 300,
  });
  return res;
}
