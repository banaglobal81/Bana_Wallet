'use client';

import { X } from 'lucide-react';
import type { ReactNode } from 'react';

// docs/specs/staking-page-v2-screen-flow-frd.md §2.3/§7 (sheet responsive
// rule): bottom sheet, full width, on mobile/sm; centered `max-w-2xl` modal
// on lg. Only the sheet's own presentation changes across breakpoints — the
// page layout itself does not (L-6).
//
// Deliberately NOT the deep-core `SheetShell` (web/src/components/staking/deep-core/sheets/SheetShell.tsx)
// — that file is game-developer's (off-limits here), and L-3 keeps the
// real-money surface out of the game's own containers on principle, not just
// by convention. This is a separate, money-side shell with the same general
// look.
export default function SheetShell({
  title,
  step,
  onClose,
  children,
}: {
  title: string;
  step?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        data-testid="staking-sheet"
        className="w-full lg:max-w-2xl max-h-[85vh] overflow-y-auto rounded-t-2xl lg:rounded-2xl bg-[#112643] border border-[#1E3559] p-4 sm:p-6 flex flex-col gap-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg sm:text-xl font-bold text-white">{title}</h3>
          <div className="flex items-center gap-3 shrink-0">
            {step && <span className="text-xs font-semibold text-[#8c90a0]">{step}</span>}
            <button type="button" onClick={onClose} className="text-[#8c90a0] hover:text-white cursor-pointer" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
