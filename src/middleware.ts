import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // `api/auth` (Auth.js) and `api/nia/webhook` (server-to-server, verified by its own
  // shared-secret header) must bypass the session gate — otherwise unauthenticated
  // inbound requests get a 302 redirect to /login and are dropped.
  matcher: ['/((?!api/auth|api/nia/webhook|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
