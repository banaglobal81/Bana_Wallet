import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  trustHost: true,
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
      return isLoggedIn;
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
