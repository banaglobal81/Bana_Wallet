import 'server-only';

import { NIA_DEFAULT_USER_ID } from './config';

/**
 * Resolve which user we are acting for (B2B = per end-user "userId").
 * Prefers searchParams, then body, then the server-configured default.
 */
export function resolveUserId(
  searchParams: URLSearchParams,
  body?: Record<string, unknown> | null,
): string {
  return (
    searchParams.get('userId') ||
    (body?.userId as string | undefined) ||
    NIA_DEFAULT_USER_ID
  );
}
