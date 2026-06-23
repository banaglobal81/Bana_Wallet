export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { prisma } from '@/lib/db';
import { sendPasswordResetEmail } from '@/lib/email/resend';

// Always respond identically whether or not the email exists — prevents using this
// endpoint to discover which emails have accounts (account enumeration).
const GENERIC_OK = { ok: true } as const;

export async function POST(req: Request) {
  let body: { email?: unknown } = {};
  try { body = await req.json(); } catch { body = {}; }
  const email = String(body.email ?? '').toLowerCase().trim();

  // Validate shape but never reveal the result to the caller.
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    try {
      const user = await prisma.user.findUnique({ where: { email } });
      // Only password accounts can reset a password (Google-only accounts have no passwordHash).
      if (user?.passwordHash) {
        const token = crypto.randomBytes(32).toString('hex');
        const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const resetTokenExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
        await prisma.user.update({
          where: { id: user.id },
          data: { resetTokenHash, resetTokenExpiry },
        });
        try {
          await sendPasswordResetEmail(user.email, token);
        } catch (e) {
          // Log server-side, but still return the generic response so a mail outage
          // or missing RESEND_API_KEY is never disclosed to the client.
          console.error('[forgot-password] email send failed:', e);
        }
      }
    } catch (e) {
      console.error('[forgot-password] database error:', e);
    }
  }

  return NextResponse.json(GENERIC_OK);
}
