import createMiddleware from 'next-intl/middleware';
import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from './auth.config';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  // API routes bypass both auth-redirect and intl rewriting — they are handled
  // directly by Next.js route handlers. Auth protection for API routes is
  // enforced in the `authorized` callback inside auth.config.ts.
  if (req.nextUrl.pathname.startsWith('/api/')) return NextResponse.next();
  return intlMiddleware(req);
});

export const config = {
  // `api/auth` (Auth.js) and `api/nia/webhook` (server-to-server, verified by its own
  // shared-secret header) must bypass the session gate — otherwise unauthenticated
  // inbound requests get a 302 redirect to /login and are dropped.
  matcher: ['/((?!api/auth|api/platform|api/coin-logo|api/r2|api/cron|api/nia/webhook|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
