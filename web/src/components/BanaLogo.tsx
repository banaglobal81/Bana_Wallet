'use client';

import React from 'react';
import wordmark from '../assets/images/bana_wordmark.png';

interface BanaLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

// The full "BANA WALLET" silver wordmark is the entire logo (emblem + text in one image).
export default function BanaLogo({ className = '', size = 'md' }: BanaLogoProps) {
  const w = { sm: 'w-[150px]', md: 'w-[205px]', lg: 'w-[380px]' }[size];
  return (
    <img
      src={typeof wordmark === 'string' ? wordmark : (wordmark as { src: string }).src}
      alt="BANA Wallet"
      className={`${w} max-w-full h-auto object-contain select-none pointer-events-none ${className}`}
      referrerPolicy="no-referrer"
    />
  );
}
