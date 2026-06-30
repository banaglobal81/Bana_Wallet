'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Theme is only known on the client — guard the icon to avoid hydration mismatch.
  useEffect(() => setMounted(true), []);

  // Treat anything that isn't explicitly 'light' as dark (the default), so the
  // first click always toggles correctly even before resolvedTheme settles.
  const isLight = resolvedTheme === 'light';

  return (
    <button
      onClick={() => setTheme(isLight ? 'dark' : 'light')}
      aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      title={isLight ? 'Dark mode' : 'Light mode'}
      className="p-2 rounded-xl border border-slate-700 bg-slate-800/40 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer"
    >
      {mounted && isLight ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
    </button>
  );
}
