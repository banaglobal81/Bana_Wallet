import { describe, expect, it } from 'vitest';
import { filterHiddenMarkets, isHiddenHubSymbol } from './hidden';

describe('isHiddenHubSymbol', () => {
  it('matches VNX exactly, case-insensitively', () => {
    expect(isHiddenHubSymbol('VNX')).toBe(true);
    expect(isHiddenHubSymbol('vnx')).toBe(true);
    expect(isHiddenHubSymbol(' Vnx ')).toBe(true);
  });
  it('never matches by prefix/suffix (VNXT stays visible)', () => {
    expect(isHiddenHubSymbol('VNXT')).toBe(false);
    expect(isHiddenHubSymbol('XVNX')).toBe(false);
    expect(isHiddenHubSymbol('')).toBe(false);
    expect(isHiddenHubSymbol(undefined)).toBe(false);
    expect(isHiddenHubSymbol(null)).toBe(false);
    expect(isHiddenHubSymbol(42)).toBe(false);
  });
});

describe('filterHiddenMarkets', () => {
  const payload = {
    currencies: [
      { symbol: 'USDT', networks: [{ networkCode: 'BSC' }] },
      { symbol: 'VNX', networks: [{ networkCode: 'SOL' }] },
      { symbol: 'VNXT', networks: [{ networkCode: 'ETH' }] },
    ],
    markets: [
      { type: 'SPOT', symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT' },
      { type: 'SPOT', symbol: 'VNXUSDT', baseAsset: 'VNX', quoteAsset: 'USDT' },
      { type: 'SPOT', symbol: 'USDTVNX', baseAsset: 'USDT', quoteAsset: 'vnx' },
      { type: 'SPOT', symbol: 'VNXTUSDT', baseAsset: 'VNXT', quoteAsset: 'USDT' },
    ],
    extra: 'kept',
  };

  it('drops hidden currencies and markets (base or quote), keeps VNXT and other fields', () => {
    const out = filterHiddenMarkets(payload);
    expect(out.currencies.map((c) => c.symbol)).toEqual(['USDT', 'VNXT']);
    expect(out.markets.map((m) => m.symbol)).toEqual(['ETHUSDT', 'VNXTUSDT']);
    expect(out.extra).toBe('kept');
  });

  it('does not mutate the input', () => {
    filterHiddenMarkets(payload);
    expect(payload.currencies).toHaveLength(3);
    expect(payload.markets).toHaveLength(4);
  });

  it('passes through missing/non-array fields and non-object payloads unchanged', () => {
    expect(filterHiddenMarkets(null)).toBeNull();
    expect(filterHiddenMarkets(undefined)).toBeUndefined();
    expect(filterHiddenMarkets('x')).toBe('x');
    const arr = [{ symbol: 'VNX' }];
    expect(filterHiddenMarkets(arr)).toBe(arr);
    expect(filterHiddenMarkets({ currencies: 'nope', markets: null })).toEqual({ currencies: 'nope', markets: null });
    expect(filterHiddenMarkets({ foo: 1 })).toEqual({ foo: 1 });
  });

  it('tolerates malformed entries inside arrays', () => {
    const out = filterHiddenMarkets({ currencies: [null, 'x', { symbol: 'VNX' }], markets: [null, { baseAsset: 'VNX' }] });
    expect(out.currencies).toEqual([null, 'x']);
    expect(out.markets).toEqual([null]);
  });
});
