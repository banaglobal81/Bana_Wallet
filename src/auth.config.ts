import type { NextAuthConfig } from 'next-auth';

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
      const { pathname } = nextUrl;
      const isAuthPage = pathname === '/login' || pathname === '/signup';
      if (isAuthPage) {
        if (isLoggedIn) {
          const dest = role === 'ADMIN' ? '/admin/settlement' : '/portfolio';
          return Response.redirect(new URL(dest, nextUrl));
        }
        return true;
      }
      const isAdminArea = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');
      if (isAdminArea) {
        if (!isLoggedIn) return false;
        if (role !== 'ADMIN') {
          if (pathname.startsWith('/api/')) return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
          return Response.redirect(new URL('/portfolio', nextUrl));
        }
        return true;
      }
      if (!isLoggedIn) {
        // API clients expect JSON, not a 302 redirect to the HTML login page.
        if (pathname.startsWith('/api/')) {
          return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
        }
        return false; // page route → Auth.js redirects to signIn
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
      return session;
    },
  },
} satisfies NextAuthConfig;
