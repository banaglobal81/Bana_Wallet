export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { requireAdmin } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { getPlatformSettings } from '@/lib/platformSettings';
import { recordAudit } from '@/lib/audit';

function publicShape(s: {
  whitelistOnly: boolean; autoApproveUnderUsd: string | null; maintenanceMode: boolean;
  dailyWithdrawalLimitUsd: string | null; signupsEnabled: boolean; supportEmail: string | null; displayName: string | null;
}) {
  return {
    whitelistOnly: s.whitelistOnly,
    autoApproveUnderUsd: s.autoApproveUnderUsd,
    maintenanceMode: s.maintenanceMode,
    dailyWithdrawalLimitUsd: s.dailyWithdrawalLimitUsd,
    signupsEnabled: s.signupsEnabled,
    supportEmail: s.supportEmail,
    displayName: s.displayName,
  };
}

/** GET — current platform settings (ADMIN only). */
export async function GET(): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }
  try {
    const s = await getPlatformSettings();
    return NextResponse.json({ ok: true, data: publicShape(s) });
  } catch (e) {
    console.error('[admin/settings GET]', e);
    return NextResponse.json({ ok: false, error: 'Service unavailable.' }, { status: 503 });
  }
}

// Validate an optional non-negative money string; returns null for empty.
function parseMoney(raw: unknown): { value: string | null } | { error: string } {
  if (raw === null || raw === '' || raw === undefined) return { value: null };
  try {
    const d = new Decimal(String(raw));
    if (!d.isFinite() || d.lt(0)) throw new Error('bad');
    return { value: d.toFixed() };
  } catch {
    return { error: 'Amount must be a non-negative number' };
  }
}

/** POST — update platform settings (ADMIN only). Accepts any subset of fields. */
export async function POST(req: Request): Promise<NextResponse> {
  let me: { id?: string; email?: string };
  try {
    me = (await requireAdmin()) as { id?: string; email?: string };
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }

  const data: Record<string, unknown> = {};
  const changes: string[] = [];

  if (typeof body.whitelistOnly === 'boolean') { data.whitelistOnly = body.whitelistOnly; changes.push(`Whitelist-only ${body.whitelistOnly ? 'on' : 'off'}`); }
  if (typeof body.maintenanceMode === 'boolean') { data.maintenanceMode = body.maintenanceMode; changes.push(`Maintenance mode ${body.maintenanceMode ? 'ON' : 'off'}`); }
  if (typeof body.signupsEnabled === 'boolean') { data.signupsEnabled = body.signupsEnabled; changes.push(`Signups ${body.signupsEnabled ? 'enabled' : 'disabled'}`); }

  if ('autoApproveUnderUsd' in body) {
    const r = parseMoney(body.autoApproveUnderUsd);
    if ('error' in r) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
    data.autoApproveUnderUsd = r.value;
    changes.push(r.value ? `Auto-approve under $${r.value}` : 'Auto-approve off');
  }
  if ('dailyWithdrawalLimitUsd' in body) {
    const r = parseMoney(body.dailyWithdrawalLimitUsd);
    if ('error' in r) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
    data.dailyWithdrawalLimitUsd = r.value;
    changes.push(r.value ? `Daily limit $${r.value}/user` : 'Daily limit off');
  }
  if ('supportEmail' in body) {
    const v = String(body.supportEmail ?? '').trim().slice(0, 120);
    if (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
      return NextResponse.json({ ok: false, error: 'Support email is not a valid email' }, { status: 400 });
    }
    data.supportEmail = v || null;
    changes.push('Support email updated');
  }
  if ('displayName' in body) {
    data.displayName = String(body.displayName ?? '').trim().slice(0, 60) || null;
    changes.push('Display name updated');
  }

  try {
    const updated = await prisma.platformSetting.upsert({
      where: { id: 'singleton' },
      update: data,
      create: { id: 'singleton', ...data },
    });
    if (changes.length) {
      await recordAudit({
        adminId: me.id, adminEmail: me.email, action: 'POLICY_UPDATE',
        detail: changes.join(' · '),
      });
    }
    return NextResponse.json({ ok: true, data: publicShape(updated) });
  } catch (e) {
    console.error('[admin/settings POST]', e);
    return NextResponse.json({ ok: false, error: 'Service unavailable.' }, { status: 503 });
  }
}
