'use client';

import React from 'react';

// The logo is the chrome "BANA" wordmark — a transparent PNG served from the CDN.
// Transparent background, so it sits cleanly on both dark and light themes.
// Sized by HEIGHT; intrinsic width/height reserve the box up front (no reflow).
const LOGO_SRC = 'https://cdn.banawallet.com/brand/BANA_mark.png?v=1';

interface BanaLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'fill';
}

export default function BanaLogo({ className = '', size = 'md' }: BanaLogoProps) {
  // fill is used in the sidebars (desktop) + mobile top bars — a touch larger on
  // desktop. sm/md are compact, lg is the login hero.
  const h = {
    sm: 'h-[26px]',
    md: 'h-[34px]',
    lg: 'h-[60px]',
    fill: 'h-[40px] lg:h-[46px]',
  }[size];
  return (
    <img
      src={LOGO_SRC}
      alt="BANA"
      width={1026}
      height={227}
      className={`${h} w-auto max-w-full object-contain select-none pointer-events-none ${className}`}
      decoding="async"
      referrerPolicy="no-referrer"
    />
  );
}
