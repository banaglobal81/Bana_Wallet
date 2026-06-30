// tests/harness/nia-signing/fixtures.js
// Deterministic inputs — timestamp/nonce are fixed so signature output is reproducible.
// (The real server uses a fresh timestamp/nonce per request — fixed here for verification.)

export const SECRET = 'test-secret-do-not-use-in-prod';
export const API_KEY = 'test-api-key';
export const FIXED_TS = '1700000000000';
export const FIXED_NONCE = '00000000-0000-4000-8000-000000000000';

export const WALLET_GET_BALANCE = {
  method: 'GET',
  apiPath: '/api/v1/wallets',
  query: { userId: 'u123', walletType: 'SPOT', currency: undefined, empty: '' },
  // Expected: after dropping undefined/'', only userId and walletType remain.
  expectedClean: { userId: 'u123', walletType: 'SPOT' },
  expectedQs: 'userId=u123&walletType=SPOT',
};

export const TRADING_POST_ORDER = {
  method: 'POST',
  path: '/api/v1/orders',
  body: { symbol: 'BTCUSDT', side: 'BUY', userId: 'u123', engineType: 'SPOT' },
};

export const ENVELOPE_SAMPLES = [
  { in: { success: true, data: { balance: '1.5' } }, out: { balance: '1.5' } },
  { in: { ok: true, data: [1, 2, 3] }, out: [1, 2, 3] },
  { in: { balance: '2.0' }, out: { balance: '2.0' } }, // not an envelope → returned as-is
];
