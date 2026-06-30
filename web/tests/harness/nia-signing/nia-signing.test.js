// tests/harness/nia-signing/nia-signing.test.js
// First harness: deterministic verification of server/core/nia-signing.js.
// Run: npx vitest run tests/harness/nia-signing
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  cleanQuery,
  queryString,
  buildSignPayload,
  buildWalletSignPayload,
  hmacHex,
  buildTradingHeaders,
  buildWalletHeaders,
  unwrapEnvelope,
} from '../../../server/core/nia-signing.js';
import {
  SECRET, API_KEY, FIXED_TS, FIXED_NONCE,
  WALLET_GET_BALANCE, TRADING_POST_ORDER, ENVELOPE_SAMPLES,
} from './fixtures.js';

describe('cleanQuery / queryString', () => {
  it('drops undefined/null/empty-string values', () => {
    expect(cleanQuery(WALLET_GET_BALANCE.query)).toEqual(WALLET_GET_BALANCE.expectedClean);
  });
  it('builds a normalized query string (no leading ?)', () => {
    expect(queryString(WALLET_GET_BALANCE.query)).toBe(WALLET_GET_BALANCE.expectedQs);
  });
  it('returns empty string for an empty query', () => {
    expect(queryString(undefined)).toBe('');
  });
});

describe('hmacHex / buildSignPayload', () => {
  it('payload is timestamp+nonce+method+path+signedPart concatenated', () => {
    const p = buildSignPayload({ timestamp: 'T', nonce: 'N', method: 'GET', path: '/x', signedPart: 'B' });
    expect(p).toBe('TNGET/xB');
  });
  it('same input yields same signature (deterministic)', () => {
    const a = hmacHex(SECRET, 'payload');
    const b = hmacHex(SECRET, 'payload');
    expect(a).toBe(b);
    // matches an independent computation
    const ref = crypto.createHmac('sha256', SECRET).update('payload').digest('hex');
    expect(a).toBe(ref);
  });
});

describe('buildWalletHeaders (X-Api-Key scheme)', () => {
  it('payload uses plain concatenation (live-verified: newline causes HTTP 401)', () => {
    const fullPath = WALLET_GET_BALANCE.apiPath + '?' + WALLET_GET_BALANCE.expectedQs;
    // LIVE-VERIFIED: plain concat = HTTP 200, newline-joined = HTTP 401 "Invalid Signature"
    const expectedPayload = `${FIXED_TS}${FIXED_NONCE}GET${fullPath}`;
    const computedPayload = buildWalletSignPayload({
      timestamp: FIXED_TS, nonce: FIXED_NONCE, method: 'GET', fullPath, bodyStr: '',
    });
    expect(computedPayload).toBe(expectedPayload);
  });

  it('signature reflects fullPath + body (plain concatenation)', () => {
    const fullPath = WALLET_GET_BALANCE.apiPath + '?' + WALLET_GET_BALANCE.expectedQs;
    const headers = buildWalletHeaders({
      apiKey: API_KEY, secret: SECRET, method: 'GET', fullPath, bodyStr: '',
      timestamp: FIXED_TS, nonce: FIXED_NONCE,
    });
    expect(headers['X-Api-Key']).toBe(API_KEY);
    expect(headers['X-Timestamp']).toBe(FIXED_TS);
    expect(headers['X-Nonce']).toBe(FIXED_NONCE);
    // Signature must be over the plain-concat payload (live-verified correct behavior).
    const expectedPayload = `${FIXED_TS}${FIXED_NONCE}GET${fullPath}`;
    const expectedSig = crypto.createHmac('sha256', SECRET)
      .update(expectedPayload)
      .digest('hex');
    expect(headers['X-Signature']).toBe(expectedSig);
    // Regression guard: newline-joined payload must NOT produce the same signature
    // (proves the previous broken behavior is not present).
    const newlinePayloadSig = crypto.createHmac('sha256', SECRET)
      .update([FIXED_TS, FIXED_NONCE, 'GET', fullPath, ''].join('\n'))
      .digest('hex');
    expect(headers['X-Signature']).not.toBe(newlinePayloadSig);
  });
});

describe('buildTradingHeaders (X-Nia-* scheme)', () => {
  it('signs the POST body as signedPart', () => {
    const signedPart = JSON.stringify(TRADING_POST_ORDER.body);
    const headers = buildTradingHeaders({
      apiKey: API_KEY, secret: SECRET, method: 'POST', path: TRADING_POST_ORDER.path,
      signedPart, timestamp: FIXED_TS, nonce: FIXED_NONCE, tenantId: 'broker1',
    });
    expect(headers['X-Nia-Tenant-Key']).toBe(API_KEY);
    expect(headers['X-Nia-Tenant-Id']).toBe('broker1');
    const expectedSig = crypto.createHmac('sha256', SECRET)
      .update(`${FIXED_TS}${FIXED_NONCE}POST${TRADING_POST_ORDER.path}${signedPart}`)
      .digest('hex');
    expect(headers['X-Nia-Signature']).toBe(expectedSig);
  });
  it('omits X-Nia-Tenant-Id when tenantId is absent', () => {
    const headers = buildTradingHeaders({
      apiKey: API_KEY, secret: SECRET, method: 'GET', path: '/api/v1/markets',
      signedPart: '', timestamp: FIXED_TS, nonce: FIXED_NONCE,
    });
    expect(headers['X-Nia-Tenant-Id']).toBeUndefined();
  });
});

describe('unwrapEnvelope', () => {
  it('unwraps a {success|ok, data} envelope', () => {
    for (const s of ENVELOPE_SAMPLES) {
      expect(unwrapEnvelope(s.in)).toEqual(s.out);
    }
  });
});
