'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';

// Tiny <img> wrapper for manifest-resolved DEEP CORE art (assetManifest.ts).
// `src` is `undefined` whenever the asset hasn't been generated yet (see
// docs/specs/deep-core-08-asset-manifest-phase0-batch1.md §6 backlog) — and
// even a manifest-listed file can still 404 or fail to decode at runtime.
// Both cases render `fallback` instead of a broken image icon, so call
// sites never need to duplicate this guard.
export default function AssetImage({
  src, alt, className, fallback = null,
}: { src: string | undefined; alt: string; className?: string; fallback?: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} draggable={false} onError={() => setFailed(true)} />
  );
}
