import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import { authConfig } from './auth.config';
import { prisma } from '@/lib/db';
import { newNiaUserId } from '@/lib/nia/identity';

// A valid bcrypt hash used only to equalize response time when no user exists,
// so login timing can't be used to enumerate which emails have accounts.
const DUMMY_HASH = '$2b$12$5VKD3CVrMoBLIAnNfv7KcOro7AwNR3BPrMrj.ADevQHws895P4qEK';

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
      credentials: { email: {}, password: {} },
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
        return { id: user.id, email: user.email, role: user.role, niaUserId: user.niaUserId };
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
      // On subsequent requests neither block runs; token is returned as-is
      // (already populated from a prior sign-in).
      return token;
    },

    // session callback is inherited unchanged from authConfig.callbacks via the spread.
  },
});
