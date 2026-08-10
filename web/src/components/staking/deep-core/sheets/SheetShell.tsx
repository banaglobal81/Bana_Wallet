'use client';

import { X } from 'lucide-react';
import type { ReactNode } from 'react';

// Shared modal shell for the 3 control-bar tabs (05 §2.5 — "모달 시트로 열린다,
// 페이지 이동 없음"). Mirrors the existing confirm-sheet visual style already
// used elsewhere on this page (web/src/components/Staking.tsx's auto-renew
// confirm sheet) so the game surface doesn't introduce a second modal look.
export default function SheetShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        data-testid="deep-core-sheet"
        className="w-full max-w-sm max-h-[80vh] overflow-y-auto rounded-2xl bg-[#0b1220] border border-[#1E3559] p-5 flex flex-col gap-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-extrabold text-white">{title}</h2>
          <button type="button" onClick={onClose} className="text-[#8c90a0] hover:text-white cursor-pointer" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
