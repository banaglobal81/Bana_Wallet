'use client';

import React from 'react';

interface BanaLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'fill';
}

// The logo is the wordmark "BANA WALLET" rendered as text with a metallic silver
// gradient (.bana-logo-text in globals.css). Under .light a darker steel variant
// kicks in so it stays readable on light backgrounds.
export default function BanaLogo({ className = '', size = 'md' }: BanaLogoProps) {
  const sizeClass = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-4xl sm:text-5xl',
    // Sidebars (desktop) want it large; the mobile top bars use fill too, so it
    // scales down on small screens.
    fill: 'text-xl lg:text-3xl',
  }[size];
  return (
    <span
      className={`bana-logo-text font-extrabold tracking-[0.06em] whitespace-nowrap select-none ${sizeClass} ${className}`}
    >
      BANA WALLET
    </span>
  );
}
