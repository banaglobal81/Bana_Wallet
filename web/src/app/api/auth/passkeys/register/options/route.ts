export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { isoUint8Array } from '@simplewebauthn/server/helpers';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { RP_NAME, rpFromRequest } from '@/lib/webauthn';

// POST /api/auth/passkeys/register/options — begin passkey enrollment. Returns
// WebAuthn creation options; the challenge is stashed on the user row and
// verified by /register/verify.
export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { passkeys: true } });
  if (!user) return NextResponse.json({ ok: false, error: 'Account not found' }, { status: 404 });

  const { rpID } = rpFromRequest(req);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    // v10+ requires userID as raw bytes (not a plain string) — our internal
    // cuid is opaque/non-PII, so UTF-8 encoding it is safe. We never need to
    // decode it back since lookups key off credentialId, not userHandle.
    userID: isoUint8Array.fromUTF8String(user.id),
    userName: user.email,
    attestationType: 'none',
    // Don't let the same authenticator enroll twice. v10+ excludeCredentials
    // entries take the base64url credential id string directly (no `type`).
    excludeCredentials: user.passkeys.map((p) => ({
      id: p.credentialId,
    })),
    authenticatorSelection: {
      // Use the device's built-in authenticator (Face ID / Touch ID / Android
      // fingerprint / Windows Hello) and require the biometric/PIN step, so
      // registration actually prompts for the fingerprint/face.
      authenticatorAttachment: 'platform',
      residentKey: 'preferred',
      requireResidentKey: false,
      userVerification: 'required',
    },
  });

  await prisma.user.update({ where: { id: userId }, data: { webauthnChallenge: options.challenge } });
  return NextResponse.json({ ok: true, data: options });
}
