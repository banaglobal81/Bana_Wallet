'use client';

import React from 'react';
import banaLockup from '../assets/images/bana_wallet_lockup.png';

interface BanaLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function BanaLogo({ className = '', size = 'md' }: BanaLogoProps) {
  // Full "BANA WALLET" lockup (emblem + wordmark) — sized by height, width auto.
  const heights = {
    sm: 'h-9',
    md: 'h-11',
    lg: 'h-20',
  };

  return (
    <img
      src={typeof banaLockup === 'string' ? banaLockup : (banaLockup as { src: string }).src}
      alt="BANA Wallet"
      className={`${heights[size]} w-auto object-contain select-none pointer-events-none ${className}`}
      referrerPolicy="no-referrer"
    />
  );
}
