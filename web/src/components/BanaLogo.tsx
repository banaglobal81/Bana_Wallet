'use client';

import React from 'react';

// The full silver "BANA WALLET" wordmark (transparent PNG served from the CDN).
// Sized by HEIGHT so it keeps the exact same vertical footprint as the previous
// logo regardless of the image's aspect ratio — layout stays unchanged. The
// intrinsic width/height attrs let the browser reserve the right box up front,
// so there's no reflow/jump on load (smooth render).
// Cropped wordmark (padding trimmed off the original, which had ~26% empty
// space above/below the letters — that's why it used to look small). The letters
// now fill the frame, so a given width renders much bigger. ?v=2 dodges a stale
// Cloudflare-cached 404 on the bare URL.
const LOGO_SRC = 'https://cdn.banawallet.com/brand/BANA_WALLET_oneline_trim.png?v=2';

interface BanaLogoProps {
  className?: string;
  // sm/md/lg size by a fixed height. `fill` spans the full width of its
  // container (used in the narrow sidebars, where a long wordmark reads best
  // when it fills the available width rather than sitting at a fixed height).
  size?: 'sm' | 'md' | 'lg' | 'fill';
}

export default function BanaLogo({ className = '', size = 'md' }: BanaLogoProps) {
  // lg (login hero) is a large ~96px (~577px wide) so it reads as a prominent
  // hero; sm/md scale down. `fill` uses full container width with auto height.
  // Heights retuned for the cropped (padding-free) wordmark, aspect ~10.9:1.
  // Because the letters now fill the frame, these render much larger than the
  // same numbers did on the old padded image.
  const dims =
    size === 'fill'
      ? 'w-full h-auto'
      : `${{ sm: 'h-[22px]', md: 'h-[26px]', lg: 'h-[54px]' }[size]} w-auto`;
  return (
    <img
      src={LOGO_SRC}
      alt="BANA Wallet"
      width={2471}
      height={226}
      className={`${dims} max-w-full object-contain select-none pointer-events-none ${className}`}
      decoding="async"
      referrerPolicy="no-referrer"
    />
  );
}
