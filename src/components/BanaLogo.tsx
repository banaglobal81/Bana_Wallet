'use client';

import React from 'react';

interface BanaLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

// Chrome / brushed-silver gradient wordmark.
const chrome: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(180deg,#f4f7fb 0%,#cfd8e4 38%,#8c99ab 52%,#b9c4d2 60%,#eef2f8 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  WebkitTextFillColor: 'transparent',
  filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.45))',
};

export default function BanaLogo({ className = '', size = 'md' }: BanaLogoProps) {
  const text = { sm: 'text-base', md: 'text-2xl', lg: 'text-4xl' }[size];

  return (
    <div
      className={`font-sans font-extrabold leading-[0.95] tracking-tight select-none ${text} ${className}`}
      style={chrome}
    >
      <div>BANA</div>
      <div>WALLET</div>
    </div>
  );
}
