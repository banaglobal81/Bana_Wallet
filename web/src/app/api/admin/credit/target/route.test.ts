// rev05a §1 (AC-13′) — GET /api/admin/credit/target 403s while adminCreditEnabled is
// false (unlike /context, which stays 200) — there is no reason to leave a
// user-balance lookup reachable while the whole surface is off.
import { afterEach, describe, expect, it, vi } from 'vitest';

const requireAdminMock = vi.fn();
vi.mock('@/lib/auth/session', () => ({ requireAdmin: (...args: unknown[]) => requireAdminMock(...args) }));

const getUserCoinBalanceMock = vi.fn();
const getUserAdminAdjustmentNetMock = vi.fn();
vi.mock('@/lib/localLedger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/localLedger')>();
  return {
    ...actual,
    getUserCoinBalance: (...args: unknown[]) => getUserCoinBalanceMock(...args),
    getUserAdminAdjustmentNet: (...args: unknown[]) => getUserAdminAdjustmentNetMock(...args),
  };
});

const getPlatformSettingsMock = vi.fn();
const findAdminCreditTargetUserMock = vi.fn();
vi.mock('@/lib/adminCredit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/adminCredit')>();
  return {
    ...actual,
    getPlatformSettings: (...args: unknown[]) => getPlatformSettingsMock(...args),
    findAdminCreditTargetUser: (...args: unknown[]) => findAdminCreditTargetUserMock(...args),
  };
});

import { GET } from './route';

function req(qs: string): Request {
  return { url: `http://x/api/admin/credit/target${qs}` } as unknown as Request;
}

describe('GET /api/admin/credit/target', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('AC-13′ — 403 ADMIN_CREDIT_DISABLED when the kill switch is off', async () => {
    requireAdminMock.mockResolvedValue({ id: 'admin-1' });
    getPlatformSettingsMock.mockResolvedValue({ adminCreditEnabled: false });

    const res = await GET(req('?email=user@test.com&coin=BANA'));
    const json = await res.json();
    expect(res.status).toBe(403);
    expect(json.code).toBe('ADMIN_CREDIT_DISABLED');
  });

  it('found:false is distinct from state:error for an unknown email', async () => {
    requireAdminMock.mockResolvedValue({ id: 'admin-1' });
    getPlatformSettingsMock.mockResolvedValue({ adminCreditEnabled: true });
    findAdminCreditTargetUserMock.mockResolvedValue(null);

    const res = await GET(req('?email=nobody@test.com&coin=BANA'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.found).toBe(false);
    expect(json.data.state).toBe('ok');
  });

  it('never renders "0" on a query failure — state:error with null figures', async () => {
    requireAdminMock.mockResolvedValue({ id: 'admin-1' });
    getPlatformSettingsMock.mockResolvedValue({ adminCreditEnabled: true });
    findAdminCreditTargetUserMock.mockResolvedValue({ id: 'u1', email: 'user@test.com' });
    getUserCoinBalanceMock.mockRejectedValue(new Error('db down'));

    const res = await GET(req('?email=user@test.com&coin=BANA'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.state).toBe('error');
    expect(json.data.balance).toBeNull();
  });

  it('returns balance/held/available/adminAdjustmentNet on success', async () => {
    requireAdminMock.mockResolvedValue({ id: 'admin-1' });
    getPlatformSettingsMock.mockResolvedValue({ adminCreditEnabled: true });
    findAdminCreditTargetUserMock.mockResolvedValue({ id: 'u1', email: 'user@test.com' });
    getUserCoinBalanceMock.mockResolvedValue({ balance: '100', held: '30', available: '70' });
    getUserAdminAdjustmentNetMock.mockResolvedValue('50');

    const res = await GET(req('?email=user@test.com&coin=BANA'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toMatchObject({ found: true, balance: '100', held: '30', available: '70', adminAdjustmentNet: '50' });
  });
});
