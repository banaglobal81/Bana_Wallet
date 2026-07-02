import type { NextAuthConfig } from 'next-auth';
import { routing } from './i18n/routing';

const LOCALES = routing.locales;

/** Strip the locale prefix from a pathname and return both parts. */
function splitLocale(pathname: string): { locale: string; rest: string } {
  const seg = pathname.split('/')[1];
  if ((LOCALES as readonly string[]).includes(seg)) {
    return { locale: seg, rest: pathname.slice(seg.length + 1) || '/' };
  }
  return { locale: routing.defaultLocale, rest: pathname };
}

export const authConfig = {
  trustHost: true,
  // Pass the secret explicitly. Auth.js usually auto-reads AUTH_SECRET, but the
  // Edge middleware (which consumes this config) can fail to pick it up, throwing
  // MissingSecret. Reading it here resolves it consistently in both runtimes.
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const role = (auth?.user as { role?: string } | undefined)?.role;

      const { locale, rest } = splitLocale(nextUrl.pathname);
      // Helper: build an absolute URL under the current locale.
      const p = (path: string) => new URL(`/${locale}${path}`, nextUrl);

      // Password-reset flow — public, accessible whether logged in or out (a user
      // who forgot their password is logged out; an email link may open while logged in).
      if (rest === '/forgot-password' || rest === '/reset-password') {
        return true;
      }

      // Auth pages (/login, /signup) — redirect logged-in users away.
      const isAuthPage = rest === '/login' || rest === '/signup';
      if (isAuthPage) {
        if (isLoggedIn) {
          const dest = role === 'ADMIN' ? '/admin/dashboard' : '/portfolio';
          return Response.redirect(p(dest));
        }
        return true;
      }

      // Admin area — requires ADMIN role.
      const isAdminArea = rest.startsWith('/admin') || rest.startsWith('/api/admin');
      if (isAdminArea) {
        if (!isLoggedIn) {
          if (rest.startsWith('/api/')) {
            return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
          }
          return false; // Auth.js redirects to signIn
        }
        if (role !== 'ADMIN') {
          if (rest.startsWith('/api/')) {
            return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
          }
          return Response.redirect(p('/portfolio'));
        }
        return true;
      }

      // All other protected routes.
      if (!isLoggedIn) {
        // API clients expect JSON, not a 302 redirect to the HTML login page.
        if (rest.startsWith('/api/')) {
          return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
        }
        return Response.redirect(p('/login'));
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.role = (user as any).role;
        token.niaUserId = (user as any).niaUserId ?? null;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).niaUserId = token.niaUserId ?? null;
      }
      session.sid = token.sid;
      return session;
    },
  },
} satisfies NextAuthConfig;
