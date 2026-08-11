// docs/specs/staking-v2-auto-renew-cutover-ruling.md §5.1 (R-AR-2) regression
// coverage for PATCH /api/staking/positions/[id]/auto-renew.
//
// The full check order this route implements (see the route's own doc
// comment for the rationale of each):
//   1 requireUser() + session identity
//   2 body shape
//   3 exists + owned by caller (both 404)
//   4 idempotent short-circuit (autoRenew===wantOn) — BEFORE 5-8, never gated
//   5 status === 'ACTIVE'
//   6 (NEW, R-AR-2) AUTO_RENEW_V2_ENABLED===false && wantOn===true -> 409 AUTO_RENEW_UNAVAILABLE
//   7 grantedByAdminId != null -> 409 AUTO_RENEW_GRANTED_POSITION
//   8 termDays > AUTO_RENEW_MAX_TERM_DAYS -> 409 AUTO_RENEW_TERM_TOO_LONG
//
// The two things the ruling requires explicitly and this suite asserts
// directly:
//   ⓐ the off-ramp ({autoRenew:false}) and the idempotent short-circuit (4)
//      are NEVER gated by check 6 (M-3 — "끄는 스위치는 결코 게이트하지 않는다").
//   ⓑ check 6 fires BEFORE checks 7/8 (a universal reason before a
//      position-specific one).
import { afterEach, describe, expect, it, vi } from 'vitest';

const requireUserMock = vi.fn();
vi.mock('@/lib/auth/session', () => ({ requireUser: (...args: unknown[]) => requireUserMock(...args) }));

const authMock = vi.fn();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

const serializePositionV2Mock = vi.fn();
vi.mock('@/lib/staking', () => ({ serializePositionV2: (...args: unknown[]) => serializePositionV2Mock(...args) }));

const stakePositionV2FindUniqueMock = vi.fn();
const stakePositionV2UpdateMock = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: {
    stakePositionV2: {
      findUnique: (...args: unknown[]) => stakePositionV2FindUniqueMock(...args),
      update: (...args: unknown[]) => stakePositionV2UpdateMock(...args),
    },
  },
}));

import { PATCH } from './route';

function makeRequest(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}
function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

const ACTIVE_POSITION = {
  id: 'pos-1',
  userId: 'user-1',
  status: 'ACTIVE',
  autoRenew: false,
  termDays: 10,
  grantedByAdminId: null,
};

describe('PATCH /api/staking/positions/[id]/auto-renew — R-AR-2', () => {
  afterEach(() => { vi.clearAllMocks(); });

  function setupAuthed() {
    requireUserMock.mockResolvedValue(undefined);
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
  }

  it('401s before touching the DB when unauthenticated', async () => {
    requireUserMock.mockRejectedValue(Object.assign(new Error('Unauthorized'), { status: 401 }));

    const res = await PATCH(makeRequest({ autoRenew: true }), makeParams('pos-1'));

    expect(res.status).toBe(401);
    expect(stakePositionV2FindUniqueMock).not.toHaveBeenCalled();
  });

  it('400s INVALID_REQUEST when autoRenew is not a boolean', async () => {
    setupAuthed();

    const res = await PATCH(makeRequest({ autoRenew: 'yes' }), makeParams('pos-1'));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe('INVALID_REQUEST');
    expect(stakePositionV2FindUniqueMock).not.toHaveBeenCalled();
  });

  it('404s POSITION_NOT_FOUND for a nonexistent position — never distinguishes from "not yours"', async () => {
    setupAuthed();
    stakePositionV2FindUniqueMock.mockResolvedValue(null);

    const res = await PATCH(makeRequest({ autoRenew: true }), makeParams('does-not-exist'));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.code).toBe('POSITION_NOT_FOUND');
  });

  it('404s POSITION_NOT_FOUND for another user\'s position (same code as "not found", never 403)', async () => {
    setupAuthed();
    stakePositionV2FindUniqueMock.mockResolvedValue({ ...ACTIVE_POSITION, userId: 'someone-else' });

    const res = await PATCH(makeRequest({ autoRenew: true }), makeParams('pos-1'));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.code).toBe('POSITION_NOT_FOUND');
  });

  describe('ⓐ off-ramp / idempotent short-circuit — never gated by AUTO_RENEW_V2_ENABLED', () => {
    it('turning OFF an already-off position (idempotent) returns 200, not 409 — before check 6 even runs', async () => {
      setupAuthed();
      stakePositionV2FindUniqueMock.mockResolvedValue({ ...ACTIVE_POSITION, autoRenew: false });
      serializePositionV2Mock.mockReturnValue({ id: 'pos-1', autoRenew: false });

      const res = await PATCH(makeRequest({ autoRenew: false }), makeParams('pos-1'));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(stakePositionV2UpdateMock).not.toHaveBeenCalled();
    });

    it('turning OFF a genuinely-on position succeeds (200) even though the engine cannot turn it back ON', async () => {
      setupAuthed();
      // A row that shouldn't be reachable via any supported path (R-AR-1's
      // invariant guard) — but if it exists, the off-ramp must still work.
      stakePositionV2FindUniqueMock.mockResolvedValue({ ...ACTIVE_POSITION, autoRenew: true });
      stakePositionV2UpdateMock.mockResolvedValue({ ...ACTIVE_POSITION, autoRenew: false });
      serializePositionV2Mock.mockReturnValue({ id: 'pos-1', autoRenew: false });

      const res = await PATCH(makeRequest({ autoRenew: false }), makeParams('pos-1'));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(stakePositionV2UpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'pos-1' }, data: { autoRenew: false } }),
      );
    });

    it('turning OFF a MATURED (non-ACTIVE) position that is currently ON still respects check 5 (409 POSITION_NOT_ACTIVE) — status gates both directions, check 6 never does', async () => {
      setupAuthed();
      stakePositionV2FindUniqueMock.mockResolvedValue({ ...ACTIVE_POSITION, status: 'MATURED', autoRenew: true });

      const res = await PATCH(makeRequest({ autoRenew: false }), makeParams('pos-1'));
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.code).toBe('POSITION_NOT_ACTIVE');
    });
  });

  describe('check 6 (R-AR-2, NEW) — on-ramp only, before checks 7/8', () => {
    it('409 AUTO_RENEW_UNAVAILABLE when turning ON an ordinary ACTIVE, ungranted, in-term-cap position', async () => {
      setupAuthed();
      stakePositionV2FindUniqueMock.mockResolvedValue({ ...ACTIVE_POSITION, autoRenew: false });

      const res = await PATCH(makeRequest({ autoRenew: true }), makeParams('pos-1'));
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.code).toBe('AUTO_RENEW_UNAVAILABLE');
      expect(stakePositionV2UpdateMock).not.toHaveBeenCalled();
    });

    it('ⓑ fires check 6 BEFORE check 7 — a grant position turning ON gets AUTO_RENEW_UNAVAILABLE, not AUTO_RENEW_GRANTED_POSITION', async () => {
      setupAuthed();
      stakePositionV2FindUniqueMock.mockResolvedValue({ ...ACTIVE_POSITION, autoRenew: false, grantedByAdminId: 'admin-1' });

      const res = await PATCH(makeRequest({ autoRenew: true }), makeParams('pos-1'));
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.code).toBe('AUTO_RENEW_UNAVAILABLE');
    });

    it('ⓑ fires check 6 BEFORE check 8 — an over-the-term-cap position turning ON gets AUTO_RENEW_UNAVAILABLE, not AUTO_RENEW_TERM_TOO_LONG', async () => {
      setupAuthed();
      stakePositionV2FindUniqueMock.mockResolvedValue({ ...ACTIVE_POSITION, autoRenew: false, termDays: 360 });

      const res = await PATCH(makeRequest({ autoRenew: true }), makeParams('pos-1'));
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.code).toBe('AUTO_RENEW_UNAVAILABLE');
    });
  });
});
