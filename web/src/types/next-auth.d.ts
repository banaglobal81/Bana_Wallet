import type { DefaultSession } from 'next-auth';
import type { JWT as DefaultJWT } from '@auth/core/jwt';

type UserRole = 'USER' | 'ADMIN';

declare module 'next-auth' {
  interface Session {
    // sid = the LoginSession row id for this device (used for remote log-out).
    sid?: string;
    user: {
      id: string;
      role: UserRole;
      niaUserId: string | null;
    } & DefaultSession['user'];
  }

  interface User {
    role: UserRole;
    niaUserId?: string | null;
  }
}

declare module '@auth/core/jwt' {
  interface JWT extends DefaultJWT {
    id: string;
    role: UserRole;
    niaUserId: string | null;
    sid?: string;
  }
}
