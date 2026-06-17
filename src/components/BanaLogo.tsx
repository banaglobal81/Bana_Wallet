'use client';

import React from 'react';
import banaLogo from '../assets/images/pb_logo.jpg';

interface BanaLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function BanaLogo({ className = '', size = 'md' }: BanaLogoProps) {
  const dimensions = {
    sm: { box: 'w-8 h-8', textTitle: 'text-xl', textSub: 'text-[9px]' },
    md: { box: 'w-10 h-10', textTitle: 'text-3xl', textSub: 'text-[10px]' },
    lg: { box: 'w-14 h-14', textTitle: 'text-4xl', textSub: 'text-[12px]' },
  };

  const current = dimensions[size];

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* Hexagonal emblem clipped into a rounded app-icon tile */}
      <div className={`relative flex items-center justify-center ${current.box} rounded-xl overflow-hidden border border-slate-700/60 shadow-[0_0_15px_rgba(82,141,255,0.25)]`}>
        <img
          src={typeof banaLogo === 'string' ? banaLogo : (banaLogo as { src: string }).src}
          alt="BANA Logo"
          className="w-full h-full object-cover scale-110"
          referrerPolicy="no-referrer"
        />
      </div>

      <div>
        <div className={`font-sans font-bold tracking-wider leading-none text-white ${current.textTitle}`}>
          BANA
        </div>
        <div className={`font-mono text-[#8c90a0] font-bold tracking-widest uppercase mt-0.5 ${current.textSub}`}>
          RWA &amp; Healthcare
        </div>
      </div>
    </div>
  );
}
