'use client';

import React from 'react';

// The full silver "BANA WALLET" wordmark (transparent PNG served from the CDN).
// Sized by HEIGHT so it keeps the exact same vertical footprint as the previous
// logo regardless of the image's aspect ratio — layout stays unchanged. The
// intrinsic width/height attrs let the browser reserve the right box up front,
// so there's no reflow/jump on load (smooth render).
const LOGO_SRC = 'https://cdn.banawallet.com/brand/BANA_WALLET_oneline_transparent.png';

interface BanaLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function BanaLogo({ className = '', size = 'md' }: BanaLogoProps) {
  // Heights match the old logo's rendered heights (old widths ÷ 8.88 aspect):
  // sm 150→17px, md 205→23px, lg 380→43px.
  const h = { sm: 'h-[17px]', md: 'h-[23px]', lg: 'h-[43px]' }[size];
  return (
    <img
      src={LOGO_SRC}
      alt="BANA Wallet"
      width={2649}
      height={441}
      className={`${h} w-auto max-w-full object-contain select-none pointer-events-none ${className}`}
      decoding="async"
      referrerPolicy="no-referrer"
    />
  );
}
