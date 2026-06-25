export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getPlatformSettings } from '@/lib/platformSettings';

/**
 * GET /api/platform — public, user-facing platform state (no secrets):
 * maintenance banner, whether signups are open, support email, display name.
 * Used by the app shell + signup page; safe to read unauthenticated.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const s = await getPlatformSettings();
    return NextResponse.json({
      ok: true,
      data: {
        maintenanceMode: s.maintenanceMode,
        signupsEnabled: s.signupsEnabled,
        supportEmail: s.supportEmail,
        displayName: s.displayName,
      },
    });
  } catch {
    // Fail open to a safe default so a transient DB issue never bricks the UI.
    return NextResponse.json({
      ok: true,
      data: { maintenanceMode: false, signupsEnabled: true, supportEmail: null, displayName: null },
    });
  }
}
