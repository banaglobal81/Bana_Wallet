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

// A word whose letters are justified edge-to-edge, so every word fills the
// same block width (BANA spreads to match WALLET) — a clean stacked lockup.
function Word({ text }: { text: string }) {
  return (
    <span className="flex justify-between w-full" style={chrome}>
      {text.split('').map((ch, i) => (
        <span key={i}>{ch}</span>
      ))}
    </span>
  );
}

export default function BanaLogo({ className = '', size = 'md' }: BanaLogoProps) {
  const s = {
    sm: { img: 'h-8', text: 'text-sm', gap: 'gap-2' },
    md: { img: 'h-10', text: 'text-xl', gap: 'gap-2.5' },
    lg: { img: 'h-16', text: 'text-3xl', gap: 'gap-3.5' },
  }[size];

  return (
    <div className={`flex items-center ${s.gap} select-none ${className}`}>
      <img
        src={typeof emblem === 'string' ? emblem : (emblem as { src: string }).src}
        alt="BANA Wallet"
        className={`${s.img} w-auto object-contain pointer-events-none`}
        referrerPolicy="no-referrer"
      />
      {/* inline-flex column sizes to the widest word (WALLET); BANA justifies to match */}
      <div className={`inline-flex flex-col font-sans font-extrabold leading-[0.95] ${s.text}`}>
        <Word text="BANA" />
        <Word text="WALLET" />
      </div>
    </div>
  );
}
