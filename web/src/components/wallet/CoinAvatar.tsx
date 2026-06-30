'use client';

import { useEffect, useState } from 'react';

// Coin logos come from the Nia CDN (cdn.niawallet.com/coins/<SYMBOL>.png — the
// symbol is UPPERCASE), then the bundled /public/coins/<ticker>.svg set, then an
// admin-uploaded R2 logo (/api/coin-logo), then a colored disc with the initial.
const CDN_BASE = 'https://cdn.niawallet.com/coins';
const BRAND: Record<string, string> = {
  USDT: '#26A17B', USDC: '#2775CA', USD1: '#1A8FE3', FDUSD: '#16A34A', DAI: '#F5AC37',
  RLUSD: '#0E76FD', BTC: '#F7931A', ETH: '#627EEA', TRX: '#EF0027', ADA: '#0033AD',
  BNB: '#F3BA2F', SOL: '#14F195', XRP: '#23292F', LINK: '#2A5ADA', POL: '#8247E5',
  PAXG: '#D4AF37', ARB: '#28A0F0', OP: '#FF0420', AVAX: '#E84142', DOGE: '#C2A633',
};

const PALETTE = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#06B6D4', '#EF4444', '#6366F1'];

function colorFor(symbol: string): string {
  if (BRAND[symbol]) return BRAND[symbol];
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export default function CoinAvatar({ symbol, size = 28 }: { symbol: string; size?: number }) {
  const lower = symbol.toLowerCase();
  const upper = symbol.toUpperCase();
  // Source chain: Nia CDN (uppercase) → R2 svg set (/api/r2/coins) → admin R2 logo → colored disc.
  const sources = [`${CDN_BASE}/${upper}.png`, `/api/r2/coins/${lower}.svg`, `/api/coin-logo/${upper}`];
  const [idx, setIdx] = useState(0);
  // Reset when the symbol changes (the trigger reuses one instance for the selected coin).
  useEffect(() => { setIdx(0); }, [symbol]);

  if (idx < sources.length) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={sources[idx]}
        alt={symbol}
        width={size}
        height={size}
        onError={() => setIdx((i) => i + 1)}
        className="rounded-full shrink-0 select-none object-contain bg-[#0a1b33]"
        style={{ width: size, height: size, padding: Math.round(size * 0.12), boxSizing: 'border-box' }}
      />
    );
  }

  // Fallback: colored disc with the coin's initial.
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-bold text-white shrink-0 select-none"
      style={{ width: size, height: size, background: colorFor(symbol), fontSize: size * 0.42 }}
      aria-hidden
    >
      {symbol.slice(0, 1)}
    </span>
  );
}
