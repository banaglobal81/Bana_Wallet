// rev05a §1 (AC-13′) — GET /api/admin/credit/context must answer 200 even while
// adminCreditEnabled is false, honestly reporting enabled:false (never 403/404) so
// the page can render its DISABLED state instead of misreading a real failure as
// "off" or vice versa (T-16 §3.1 LOAD_FAILED-vs-DISABLED priority).
import { afterEach, describe, expect, it, vi } from 'vitest';

const requireAdminMock = vi.fn();
vi.mock('@/lib/auth/session', () => ({ requireAdmin: (...args: unknown[]) => requireAdminMock(...args) }));

const getPlatformSettingsMock = vi.fn();
const listLocalAdminCreditCoinsMock = vi.fn();
const computeAdminCreditLimitRowsMock = vi.fn();

vi.mock('@/lib/adminCredit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/adminCredit')>();
  return {
    ...actual,
    getPlatformSettings: (...args: unknown[]) => getPlatformSettingsMock(...args),
    listLocalAdminCreditCoins: (...args: unknown[]) => listLocalAdminCreditCoinsMock(...args),
    computeAdminCreditLimitRows: (...args: unknown[]) => computeAdminCreditLimitRowsMock(...args),
  };
});

import { GET } from './route';

function req(url = 'http://x/api/admin/credit/context'): Request {
  return { url } as unknown as Request;
}

describe('GET /api/admin/credit/context', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('AC-13′ — 200 with enabled:false, coins, and limits when the kill switch is off (never 403/404)', async () => {
    requireAdminMock.mockResolvedValue({ id: 'admin-1' });
    getPlatformSettingsMock.mockResolvedValue({ adminCreditEnabled: false, adminCreditMaxPerTx: null, adminCreditMaxPerDay: null, adminCreditCumulativeCap: null });
    listLocalAdminCreditCoinsMock.mockResolvedValue([{ symbol: 'BANA', balanceAuthority: 'LOCAL', authorityAlertStage: 'CLEAR' }]);
    computeAdminCreditLimitRowsMock.mockResolvedValue([
      { key: 'perTx', limit: null, used: null, remaining: null },
      { key: 'perDay', limit: null, used: null, remaining: null },
      { key: 'cumulative', limit: null, used: null, remaining: null },
    ]);

    const res = await GET(req());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.enabled).toBe(false);
    expect(json.data.state).toBe('ok');
    expect(json.data.coins).toHaveLength(1);
  });

  it('DC-1 — collapses every field to null on a query failure (never partial-renders)', async () => {
    requireAdminMock.mockResolvedValue({ id: 'admin-1' });
    getPlatformSettingsMock.mockRejectedValue(new Error('db down'));

    const res = await GET(req());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toEqual({ enabled: null, coins: null, limits: null, state: 'error' });
  });

  it('requires admin auth', async () => {
    requireAdminMock.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    const res = await GET(req());
    expect(res.status).toBe(403);
  });
});
