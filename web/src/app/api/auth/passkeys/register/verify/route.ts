export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/types';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { rpFromRequest } from '@/lib/webauthn';

// POST /api/auth/passkeys/register/verify — verify the authenticator's response
// against the stored challenge, then persist the credential ("device").
export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  let body: { response?: RegistrationResponseJSON; deviceName?: string } = {};
  try { body = await req.json(); } catch { body = {}; }
  if (!body.response) return NextResponse.json({ ok: false, error: 'Missing registration response' }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.webauthnChallenge) {
    return NextResponse.json({ ok: false, error: 'Start passkey registration first.' }, { status: 400 });
  }

  const { rpID, origin } = rpFromRequest(req);
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: user.webauthnChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message || 'Verification failed' }, { status: 400 });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ ok: false, error: 'Passkey could not be verified.' }, { status: 400 });
  }

  const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;
  const credentialId = Buffer.from(credentialID).toString('base64url');
  const publicKey = Buffer.from(credentialPublicKey).toString('base64url');

  const existing = await prisma.passkey.findUnique({ where: { credentialId } });
  if (existing) {
    await prisma.user.update({ where: { id: userId }, data: { webauthnChallenge: null } });
    return NextResponse.json({ ok: false, error: 'This device is already registered.' }, { status: 400 });
  }

  await prisma.passkey.create({
    data: {
      userId,
      credentialId,
      publicKey,
      counter,
      transports: body.response.response?.transports ?? [],
      deviceName: (body.deviceName || 'Passkey').toString().slice(0, 40),
    },
  });
  await prisma.user.update({ where: { id: userId }, data: { webauthnChallenge: null } });

  return NextResponse.json({ ok: true });
}
