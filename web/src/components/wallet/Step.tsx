'use client';

import type { ReactNode } from 'react';

// One numbered step in the deposit/withdraw flow: a number disc joined by a
// vertical connector line, with the step title + content to its right.
export default function Step({
  n, title, active, last, children,
}: {
  n: number;
  title: string;
  active?: boolean;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center shrink-0">
        <div
          className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold border transition-colors ${
            active
              ? 'bg-[#2E7DFF] border-[#528dff] text-white'
              : 'bg-[#0a1b33] border-[#1E3559] text-[#56607a]'
          }`}
        >
          {n}
        </div>
        {!last && <div className="w-px flex-1 my-1 bg-[#1E3559]" />}
      </div>
      <div className={`flex-1 min-w-0 ${last ? 'pb-2' : 'pb-8'}`}>
        <h2 className={`text-xl font-extrabold tracking-tight mb-4 ${active ? 'text-white' : 'text-[#56607a]'}`}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
