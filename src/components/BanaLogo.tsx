'use client';

import React from 'react';
import emblem from '../assets/images/bana_emblem.png';

interface BanaLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

// Polished silver gradient — bright, neutral metallic (no blue tint).
const chrome: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(180deg,#ffffff 0%,#e4e6ea 30%,#b4b8c0 50%,#9a9ea7 58%,#cfd2d8 74%,#f6f7f9 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  WebkitTextFillColor: 'transparent',
  filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.45))',
};

export default function BanaLogo({ className = '', size = 'md' }: BanaLogoProps) {
  const s = {
    sm: { img: 'h-12', text: 'text-lg', gap: 'gap-2' },
    md: { img: 'h-14', text: 'text-3xl', gap: 'gap-2.5' },
    lg: { img: 'h-24', text: 'text-5xl', gap: 'gap-3.5' },
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
      <div className={`font-sans font-extrabold leading-[0.95] tracking-tight ${s.text}`}>
        {/* Scale each word horizontally so BANA and WALLET share one width.
            chrome gradient is applied per-word (background-clip:text breaks if a
            transformed child inherits it from the parent). */}
        <div style={{ ...chrome, width: 'fit-content', transform: 'scaleX(1.30)', transformOrigin: 'left' }}>BANA</div>
        <div style={{ ...chrome, width: 'fit-content', transform: 'scaleX(0.90)', transformOrigin: 'left' }}>WALLET</div>
      </div>
    </div>
  );
}
