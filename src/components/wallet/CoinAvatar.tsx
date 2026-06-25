'use client';

// Brand-colored round coin badge. No external icon library / network images
// (those can fail or render fake) — a deterministic colored disc with the coin's
// initial, using known brand colors where we have them.
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
  const bg = colorFor(symbol);
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-bold text-white shrink-0 select-none"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.42 }}
      aria-hidden
    >
      {symbol.slice(0, 1)}
    </span>
  );
}
