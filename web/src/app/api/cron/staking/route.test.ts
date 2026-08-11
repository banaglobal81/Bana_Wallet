// rev05 CUT-3 (T-6) coverage for POST/GET /api/cron/staking:
//   - CS-2′ invariant guard (wallet-security-expert REJECT fix): a nonzero
//     legacy StakePosition ACTIVE count must fail LOUD (500), never a silent
//     200 skipped/settled — rev05 §5.1 P-27's "hold never releases, user
//     never notified" failure mode.
//   - stakingV2WorkerEnabled gating (skip vs. run).
//   - GET schedule/count now reads StakePositionV2 + stakingV2Worker* fields.
import { afterEach, describe, expect, it, vi } from 'vitest';

const stakePositionCountMock = vi.fn();
const stakePositionV2CountMock = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: {
    stakePosition: { count: (...args: unknown[]) => stakePositionCountMock(...args) },
    stakePositionV2: { count: (...args: unknown[]) => stakePositionV2CountMock(...args) },
  },
}));

const runStakingSettlementV2Mock = vi.fn();
vi.mock('@/lib/stakingV2', () => ({
  runStakingSettlementV2: (...args: unknown[]) => runStakingSettlementV2Mock(...args),
}));

const getPlatformSettingsMock = vi.fn();
vi.mock('@/lib/platformSettings', () => ({
  getPlatformSettings: (...args: unknown[]) => getPlatformSettingsMock(...args),
}));

import { GET, POST } from './route';

const SECRET = 'test-cron-secret';

function makeReq(headers: Record<string, string> = {}): Request {
  return { headers: { get: (k: string) => headers[k.toLowerCase()] ?? headers[k] ?? null } } as unknown as Request;
}

describe('POST /api/cron/staking', () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
  });

  it('rejects without the shared secret configured', async () => {
    const res = await POST(makeReq({ 'x-cron-secret': 'anything' }));
    expect(res.status).toBe(503);
  });

  it('rejects a request with the wrong secret', async () => {
    process.env.CRON_SECRET = SECRET;
    const res = await POST(makeReq({ 'x-cron-secret': 'wrong' }));
    expect(res.status).toBe(401);
    expect(stakePositionCountMock).not.toHaveBeenCalled();
  });

  it('CS-2′ guard: fails loud (500, LEGACY_POSITIONS_UNSETTLED) when legacy ACTIVE StakePosition rows exist — never a silent skip/run', async () => {
    process.env.CRON_SECRET = SECRET;
    stakePositionCountMock.mockResolvedValueOnce(3);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(makeReq({ 'x-cron-secret': SECRET }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('LEGACY_POSITIONS_UNSETTLED');
    expect(errorSpy).toHaveBeenCalled();
    // Neither the "disabled -> skip" branch nor the V2 engine may run once
    // this invariant is violated.
    expect(getPlatformSettingsMock).not.toHaveBeenCalled();
    expect(runStakingSettlementV2Mock).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it('reports a silent-safe 200 skipped (not an error) when legacy count is 0 and stakingV2WorkerEnabled is false', async () => {
    process.env.CRON_SECRET = SECRET;
    stakePositionCountMock.mockResolvedValueOnce(0);
    getPlatformSettingsMock.mockResolvedValueOnce({ stakingV2WorkerEnabled: false });

    const res = await POST(makeReq({ 'x-cron-secret': SECRET }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data).toMatchObject({ skipped: true });
    expect(runStakingSettlementV2Mock).not.toHaveBeenCalled();
  });

  it('runs the V2 engine when legacy count is 0 and stakingV2WorkerEnabled is true', async () => {
    process.env.CRON_SECRET = SECRET;
    stakePositionCountMock.mockResolvedValueOnce(0);
    getPlatformSettingsMock.mockResolvedValueOnce({ stakingV2WorkerEnabled: true });
    runStakingSettlementV2Mock.mockResolvedValueOnce({ processed: 1, daysCredited: 1 });

    const res = await POST(makeReq({ 'x-cron-secret': SECRET }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data).toMatchObject({ processed: 1, daysCredited: 1 });
    expect(runStakingSettlementV2Mock).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/cron/staking', () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
  });

  it('reports StakePositionV2 active count and the stakingV2Worker* schedule', async () => {
    process.env.CRON_SECRET = SECRET;
    stakePositionV2CountMock.mockResolvedValueOnce(7);
    getPlatformSettingsMock.mockResolvedValueOnce({
      stakingV2WorkerEnabled: true, stakingV2WorkerMode: 'INTERVAL',
      stakingV2WorkerIntervalMinutes: 5, stakingV2WorkerDailyTime: '00:00',
    });

    const res = await GET(makeReq({ 'x-cron-secret': SECRET }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.activePositions).toBe(7);
    expect(json.data.schedule).toEqual({ enabled: true, mode: 'INTERVAL', intervalMinutes: 5, dailyTime: '00:00' });
  });
});
