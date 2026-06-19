'use client';

import React from 'react';
import emblem from '../assets/images/bana_emblem.png';

interface BanaLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

// Chrome / brushed-silver gradient to match the metallic emblem.
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
  const s = {
    sm: { img: 'h-10', text: 'text-base', gap: 'gap-2' },
    md: { img: 'h-12', text: 'text-2xl', gap: 'gap-2.5' },
    lg: { img: 'h-20', text: 'text-4xl', gap: 'gap-3.5' },
  }[size];

  return (
    <div className={`flex items-center ${s.gap} select-none ${className}`}>
      {/* B emblem icon (photo) */}
      <img
        src={typeof emblem === 'string' ? emblem : (emblem as { src: string }).src}
        alt="BANA Wallet"
        className={`${s.img} w-auto object-contain pointer-events-none`}
        referrerPolicy="no-referrer"
      />
      {/* BANA WALLET wordmark (text) */}
      <div
        className={`font-sans font-extrabold leading-[0.95] tracking-tight ${s.text}`}
        style={chrome}
      >
        <div>BANA</div>
        <div>WALLET</div>
      </div>
    </div>
  );
}
