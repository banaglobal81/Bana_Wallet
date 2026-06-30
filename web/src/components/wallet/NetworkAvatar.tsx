'use client';

import { useEffect, useState } from 'react';

// Chain logos come from the Nia CDN (uppercase), then the bundled /public/coins svg. See CoinAvatar.
const CDN_BASE = 'https://cdn.niawallet.com/coins';

// Network code → chain icon filename. Codes not listed fall back to a colored
// initial (e.g. L2s like ARB/OP/BASE/SCROLL that share no chain icon).
const NET_ICON: Record<string, string> = {
  ETH: 'eth', ETHEREUM: 'eth', ERC20: 'eth',
  BSC: 'bnb', BNB: 'bnb', BEP20: 'bnb',
  TRX: 'trx', TRON: 'trx', TRC20: 'trx',
  SOL: 'sol', SOLANA: 'sol',
  MATIC: 'matic', POLYGON: 'matic', POL: 'matic',
  AVAX: 'avax', AVAXC: 'avax', AVALANCHE: 'avax',
  ATOM: 'atom', COSMOS: 'atom',
  DOT: 'dot', POLKADOT: 'dot',
  XTZ: 'xtz', TEZOS: 'xtz',
  ONE: 'one', HARMONY: 'one',
  ADA: 'ada', CARDANO: 'ada',
  BTC: 'btc', BITCOIN: 'btc',
  DOGE: 'doge',
  XRP: 'xrp', RIPPLE: 'xrp',
  // L2s / newer chains — logos extracted from the web3icons set into /public/coins
  ARBITRUM: 'arbitrum', ARB: 'arbitrum',
  BASE: 'base',
  OPTIMISM: 'optimism', OP: 'optimism',
  SCROLL: 'scroll',
  CELO: 'celo',
  SUI: 'sui',
};

// Brand colors for networks we don't have an icon for (used by the fallback disc).
const NET_BRAND: Record<string, string> = {
  ARB: '#28A0F0', ARBITRUM: '#28A0F0', OP: '#FF0420', OPTIMISM: '#FF0420',
  BASE: '#0052FF', CELO: '#35D07F', SCROLL: '#EBC28E', LINEA: '#61DFFF', ZKSYNC: '#8C8DFC',
};

const PALETTE = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#06B6D4', '#EF4444', '#6366F1'];

function colorFor(code: string): string {
  if (NET_BRAND[code]) return NET_BRAND[code];
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export default function NetworkAvatar({ code, size = 22 }: { code: string; size?: number }) {
  const upper = code.toUpperCase();
  const file = NET_ICON[upper];
  // Source chain: CDN → bundled local svg → colored-initial disc.
  const sources = file ? [`${CDN_BASE}/${file.toUpperCase()}.png`, `/api/r2/coins/${file}.svg`] : [];
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [code]);

  if (idx < sources.length) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={sources[idx]}
        alt={code}
        width={size}
        height={size}
        onError={() => setIdx((i) => i + 1)}
        className="rounded-full shrink-0 select-none object-contain bg-[#0a1b33]"
        style={{ width: size, height: size, padding: Math.round(size * 0.12), boxSizing: 'border-box' }}
      />
    );
  }

  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-bold text-white shrink-0 select-none"
      style={{ width: size, height: size, background: colorFor(upper), fontSize: size * 0.4 }}
      aria-hidden
    >
      {code.slice(0, 1)}
    </span>
  );
}
