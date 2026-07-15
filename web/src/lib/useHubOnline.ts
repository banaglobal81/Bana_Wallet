'use client';

import { useEffect, useState } from 'react';
import { getNiaStatus } from '@/utils/niaApi';

// How often to re-check whether the hub is up.
const POLL_MS = 60_000;

/**
 * Real Nia-Hub reachability, for status lights.
 *
 * Returns `null` until the first check comes back — callers should render a
 * "checking" state rather than guessing, so the UI never claims a status we
 * haven't actually verified. `true` only when the hub is both configured and
 * answered a live ping.
 */
export function useHubOnline(): boolean | null {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const s = await getNiaStatus();
        if (!cancelled) setOnline(Boolean(s.configured && s.reachable));
      } catch {
        if (!cancelled) setOnline(false);
      }
    };
    check();
    const id = setInterval(check, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return online;
}
