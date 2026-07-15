import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import { headers, cookies } from 'next/headers';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { authConfig } from './auth.config';
import { prisma } from '@/lib/db';
import { newNiaUserId } from '@/lib/nia/identity';
import { clientIp, geoLookup } from '@/lib/session-device';
import { rpFromHeaders } from '@/lib/webauthn';
import { verifyTotp, matchBackupCode } from '@/lib/totp';
import { decryptSecret } from '@/lib/crypto';

// A valid bcrypt hash used only to equalize response time when no user exists,
// so login timing can't be used to enumerate which emails have accounts.
const DUMMY_HASH = '$2b$12$5VKD3CVrMoBLIAnNfv7KcOro7AwNR3BPrMrj.ADevQHws895P4qEK';

/**
 * The account's Nia-Hub end-user id, minting one if the account predates
 * per-user ids.
 *
 * EVERY sign-in path must go through this. Without a niaUserId, resolveSessionUserId()
 * fails closed and every wallet route 403s — permanently, since nothing else
 * backfills it. Google logins already self-healed; password/passkey ones did not,
 * so a legacy account could log in fine yet never see its balances.
 */
async function ensureNiaUserId(user: { id: string; niaUserId: string | null }): Promise<string> {
  if (user.niaUserId) return user.niaUserId;
  const minted = newNiaUserId();
  // Guarded on niaUserId: null so two concurrent logins can't both mint and
  // clobber each other — the loser reads back the winner's id instead.
  const claimed = await prisma.user.updateMany({
    where: { id: user.id, niaUserId: null },
    data: { niaUserId: minted },
  });
  if (claimed.count === 1) return minted;
  const fresh = await prisma.user.findUnique({
    where: { id: user.id },
    select: { niaUserId: true },
  });
  return fresh?.niaUserId ?? minted;
}

// Behind Railway's proxy, Auth.js can't derive its public URL from the request
// and falls back to the internal http://localhost:8080 (Railway's container
// port). That wrong base URL is then sent to Google as the OAuth callback and
// used for post-logout redirects, producing ERR_CONNECTION_REFUSED. Railway
// injects the real public domain as RAILWAY_PUBLIC_DOMAIN, so use it to set
// AUTH_URL before NextAuth initializes (also override a stale localhost value).
// Locally RAILWAY_PUBLIC_DOMAIN is undefined, so nothing changes — trustHost
// keeps deriving http://localhost:3000 from the request as before.
const railwayUrl = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : undefined;
if (railwayUrl && (!process.env.AUTH_URL || process.env.AUTH_URL.includes('localhost'))) {
  process.env.AUTH_URL = railwayUrl;
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {}, totp: {} },
      async authorize(creds) {
        const email = String(creds?.email ?? '').toLowerCase().trim();
        const password = String(creds?.password ?? '');
        if (!email || !password) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          // Spend the same time as a real compare so the response can't reveal
          // whether the email exists.
          await bcrypt.compare(password, DUMMY_HASH);
          return null;
        }
        // Google-only accounts have no passwordHash; they must sign in with Google.
        if (!user.passwordHash) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;
        // Disabled accounts cannot sign in (admin-locked).
        if (user.disabled) return null;

        // SECOND FACTOR: if 2FA is enabled, a valid TOTP code (or a one-time
        // backup code) is REQUIRED — password alone is not enough.
        if (user.totpEnabledAt && user.totpSecret) {
          const code = String(creds?.totp ?? '').trim();
          if (!code) return null; // client must collect + resubmit the code
          let secondFactorOk = false;
          try {
            secondFactorOk = verifyTotp(code, decryptSecret(user.totpSecret));
          } catch { secondFactorOk = false; }
          if (!secondFactorOk) {
            // Fall back to a one-time backup code, consumed ATOMICALLY: the update
            // only matches while the code is still present, so two concurrent
            // logins presenting the same code can't both succeed (the loser gets
            // count 0). Prevents a single backup code authenticating twice.
            const usedHash = matchBackupCode(code, user.totpBackupCodes);
            if (usedHash) {
              const consumed = await prisma.user.updateMany({
                where: { id: user.id, totpBackupCodes: { has: usedHash } },
                data: { totpBackupCodes: { set: user.totpBackupCodes.filter((h) => h !== usedHash) } },
              });
              if (consumed.count === 1) secondFactorOk = true;
            }
          }
          if (!secondFactorOk) return null;
        }

        return { id: user.id, email: user.email, role: user.role, niaUserId: await ensureNiaUserId(user) };
      },
    }),
    // Passwordless biometric login: verify a WebAuthn assertion against a
    // registered passkey. The challenge was set in an httpOnly cookie by
    // /api/auth/passkeys/authenticate/options.
    Credentials({
      id: 'passkey',
      name: 'Passkey',
      credentials: { response: {} },
      async authorize(creds) {
        try {
          const responseJSON = String((creds as { response?: unknown })?.response ?? '');
          if (!responseJSON) return null;
          const response = JSON.parse(responseJSON);

          const jar = await cookies();
          const challenge = jar.get('webauthn_auth_challenge')?.value;
          if (!challenge) return null;
          // Consume the challenge so it is single-use (no replay within its TTL).
          // Best-effort: never let a cookie-write issue break a valid login.
          try { jar.delete('webauthn_auth_challenge'); } catch { /* best-effort */ }

          const passkey = await prisma.passkey.findUnique({
            where: { credentialId: String(response.id) },
            include: { user: true },
          });
          if (!passkey) return null;

          const { rpID, origin } = rpFromHeaders(await headers());
          const verification = await verifyAuthenticationResponse({
            response,
            expectedChallenge: challenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            requireUserVerification: true,
            authenticator: {
              credentialID: new Uint8Array(Buffer.from(passkey.credentialId, 'base64url')),
              credentialPublicKey: new Uint8Array(Buffer.from(passkey.publicKey, 'base64url')),
              counter: passkey.counter,
            },
          });
          if (!verification.verified) return null;

          await prisma.passkey.update({
            where: { id: passkey.id },
            data: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() },
          });

          const u = passkey.user;
          if (u.disabled) return null;
          return { id: u.id, email: u.email, role: u.role, niaUserId: await ensureNiaUserId(u) };
        } catch (e) {
          console.error('[passkey-login] verification failed:', e);
          return null;
        }
      },
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  callbacks: {
    // Spread the Edge-safe callbacks from authConfig, then override signIn and jwt
    // with Node-only (Prisma) logic. The middleware keeps using authConfig directly
    // and never sees these overrides.
    ...authConfig.callbacks,

    async signIn({ user, account }) {
      if (account?.provider === 'google') {
        const email = user.email?.toLowerCase();
        if (!email) return false;
        // Upsert: create a USER-role record if this Google email is new,
        // otherwise leave the existing record untouched (update:{}).
        const record = await prisma.user.upsert({
          where: { email },
          // Mint a Nia-Hub end-user id for brand-new Google accounts. `update: {}`
          // leaves existing accounts (and their existing niaUserId) untouched.
          update: {},
          create: { email, role: 'USER', niaUserId: newNiaUserId() },
        });
        // Disabled accounts cannot sign in (admin-locked).
        if (record.disabled) return false;
        // Backfill niaUserId for a legacy Google account created before per-user
        // Nia ids existed — without it, wallet routes fail closed with 403.
        await ensureNiaUserId(record);
        return true;
      }
      // Credentials path — authorize() already validated, just allow through.
      return true;
    },

    async jwt({ token, user, account }) {
      if (account?.provider === 'google' && user?.email) {
        // After Google sign-in the `user` object only has name/email/image from
        // the OIDC profile; fetch our DB record to get id/role/niaUserId.
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email.toLowerCase() },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
          token.niaUserId = dbUser.niaUserId ?? null;
        }
      } else if (user) {
        // Credentials path: authorize() already returned the full shape.
        token.id = (user as any).id;
        token.role = (user as any).role;
        token.niaUserId = (user as any).niaUserId ?? null;
      }
      // On sign-in (user present), record a login session and remember its id in
      // the token so "My Devices" can list this device and remotely revoke it.
      // Fail-open: never block sign-in if tracking fails.
      if (user && token.id && !token.sid) {
        try {
          const h = await headers();
          const ip = clientIp(h);
          const geo = await geoLookup(ip, h.get('cf-ipcountry'));
          const ls = await prisma.loginSession.create({
            data: {
              userId: token.id as string,
              userAgent: h.get('user-agent') || null,
              ip: ip || null,
              city: geo.city,
              country: geo.country,
            },
          });
          token.sid = ls.id;
        } catch (e) {
          console.error('[session-tracking] failed to record login session:', e);
        }
      }
      // On subsequent requests neither block runs; token is returned as-is
      // (already populated from a prior sign-in).
      return token;
    },

    // session callback is inherited unchanged from authConfig.callbacks via the spread.
  },
});
