export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';

// A bcrypt hash used only to equalize timing when no user/password exists — so
// this endpoint can't be used to enumerate accounts any more than login can.
const DUMMY_HASH = '$2b$12$5VKD3CVrMoBLIAnNfv7KcOro7AwNR3BPrMrj.ADevQHws895P4qEK';

// POST /api/auth/login-precheck — verifies email+password ONLY to decide whether
// the login form must collect a 2FA code next. It does NOT log the user in; the
// actual second-factor check is enforced server-side in the credentials
// authorize(). 2FA status is revealed only to a caller who already has the
// correct password (they've cleared the first factor), so this is not new leakage.
export async function POST(req: Request): Promise<NextResponse> {
  let body: { email?: unknown; password?: unknown } = {};
  try { body = await req.json(); } catch {}
  const email = String(body.email ?? '').toLowerCase().trim();
  const password = String(body.password ?? '');

  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  if (!user || !user.passwordHash) {
    await bcrypt.compare(password, DUMMY_HASH);
    return NextResponse.json({ ok: false });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok || user.disabled) return NextResponse.json({ ok: false });

  return NextResponse.json({ ok: true, twoFactor: Boolean(user.totpEnabledAt) });
}
