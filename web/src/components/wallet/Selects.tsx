'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';
import CoinAvatar from './CoinAvatar';
import NetworkAvatar from './NetworkAvatar';

function useOutsideClose(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  return ref;
}

const triggerCls =
  'w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl bg-[#0a1b33] border text-left transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
const panelCls =
  'absolute z-30 mt-2 right-0 w-[min(340px,calc(100vw-1.5rem))] min-w-full rounded-xl bg-[#0a1b33] border border-[#1E3559] shadow-2xl shadow-black/50 overflow-hidden';

// ---- Searchable coin selector ----
export function CoinSelect({
  value, options, onChange, placeholder, disabled, searchPlaceholder,
}: {
  value: string;
  options: string[];
  onChange: (symbol: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useOutsideClose(() => setOpen(false));
  const filtered = options.filter((s) => !q.trim() || s.toUpperCase().includes(q.trim().toUpperCase()));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`${triggerCls} hover:border-[#3a5278]`}
        style={{ borderColor: open ? '#528dff' : '#1E3559' }}
      >
        {value ? (
          <span className="flex items-center gap-3 min-w-0">
            <CoinAvatar symbol={value} />
            <span className="font-bold text-white truncate">{value}</span>
          </span>
        ) : (
          <span className="text-[#8c90a0]">{placeholder}</span>
        )}
        <ChevronDown className={`h-4 w-4 text-[#8c90a0] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className={panelCls}>
          <div className="p-2.5 border-b border-[#1E3559]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8c90a0] pointer-events-none" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-[#06132a] border border-[#1E3559] text-sm text-white placeholder-[#8c90a0] focus:outline-none focus:border-[#528dff]/70"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs font-mono text-[#8c90a0]">—</p>
            ) : filtered.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { onChange(s); setOpen(false); setQ(''); }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${
                  s === value ? 'bg-[#16325c]' : 'hover:bg-[#112643]'
                }`}
              >
                <CoinAvatar symbol={s} />
                <span className="flex flex-col min-w-0">
                  <span className="text-sm font-bold text-white truncate">{s}</span>
                  <span className="text-[11px] text-[#8c90a0] truncate">{s}</span>
                </span>
                {s === value && <Check className="h-4 w-4 text-[#528dff] ml-auto shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Network selector (no search) ----
export function NetworkSelect({
  value, options, onChange, placeholder, disabled,
}: {
  value: string;
  options: string[];
  onChange: (code: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(() => setOpen(false));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled || options.length === 0}
        onClick={() => setOpen((v) => !v)}
        className={`${triggerCls}`}
        style={{ borderColor: open ? '#528dff' : '#1E3559' }}
      >
        {value ? (
          <span className="flex items-center gap-3 min-w-0">
            <NetworkAvatar code={value} />
            <span className="font-bold text-white truncate">{value}</span>
          </span>
        ) : (
          <span className="text-[#8c90a0]">{placeholder}</span>
        )}
        <ChevronDown className={`h-4 w-4 text-[#8c90a0] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && options.length > 0 && (
        <div className={panelCls}>
          <div className="max-h-60 overflow-y-auto py-1">
            {options.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { onChange(c); setOpen(false); }}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors ${
                  c === value ? 'bg-[#16325c]' : 'hover:bg-[#112643]'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <NetworkAvatar code={c} />
                  <span className="text-sm font-bold text-white truncate">{c}</span>
                </span>
                {c === value && <Check className="h-4 w-4 text-[#528dff] shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
