export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
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
    userID: user.id,
    userName: user.email,
    attestationType: 'none',
    // Don't let the same authenticator enroll twice.
    excludeCredentials: user.passkeys.map((p) => ({
      id: new Uint8Array(Buffer.from(p.credentialId, 'base64url')),
      type: 'public-key' as const,
    })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });

  await prisma.user.update({ where: { id: userId }, data: { webauthnChallenge: options.challenge } });
  return NextResponse.json({ ok: true, data: options });
}
