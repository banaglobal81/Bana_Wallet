import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Locale-aware navigation wrappers. Import Link/useRouter/usePathname/redirect
// from here (instead of next/navigation or next/link) in app code: paths stay
// bare (e.g. '/portfolio') and the active locale is applied automatically, and
// usePathname() returns the locale-STRIPPED path so equality checks keep working.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
