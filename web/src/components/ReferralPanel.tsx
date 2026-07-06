'use client';

import { useEffect, useState, useCallback } from 'react';
import { Users, Copy, Check, Gift, Loader2, TrendingUp } from 'lucide-react';
import { getReferral, getReferralEarnings, type ReferralInfo, type ReferralEarnings } from '@/utils/niaApi';
import { copyToClipboard } from '@/utils/clipboard';

// User-facing referral + commission panel. Shows the invite link/code, direct
// referral count, and referral commission earned (대·소실적 매칭 + 유니레벨 부스트).
export default function ReferralPanel() {
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [earn, setEarn] = useState<ReferralEarnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [i, e] = await Promise.all([getReferral(), getReferralEarnings().catch(() => null)]);
      setInfo(i); setEarn(e);
    } catch { /* leave empty */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const fullLink = info?.link?.startsWith('http')
    ? info.link
    : (typeof window !== 'undefined' ? `${window.location.origin}${info?.link ?? ''}` : info?.link ?? '');

  const copy = async () => {
    if (!fullLink) return;
    if (await copyToClipboard(fullLink)) { setCopied(true); setTimeout(() => setCopied(false), 1500); }
  };

  if (loading) {
    return <div className="p-6 rounded-2xl bg-[#112643]/70 border border-[#1E3559] text-xs font-mono text-[#8c90a0]">Loading referral…</div>;
  }
  if (!info) return null;

  const card = 'p-4 rounded-2xl bg-[#112643]/70 border border-[#1E3559]';

  return (
    <section className="flex flex-col gap-4" data-testid="referral-panel">
      <h2 className="text-sm font-extrabold uppercase tracking-wider text-[#d8e2ff] flex items-center gap-2">
        <Gift className="h-4 w-4 text-emerald-400" /> Invite &amp; Earn
      </h2>

      {/* Invite link */}
      <div className={`${card} flex flex-col gap-3`}>
        <div className="flex items-center gap-2 text-xs font-mono text-[#8c90a0]">
          <Users className="h-3.5 w-3.5" /> Your invite link · code <span className="text-[#afc6ff] font-bold" data-testid="referral-code">{info.code}</span>
          <span className="ml-auto text-[#afc6ff]"><span className="font-bold text-white">{info.directReferrals}</span> invited</span>
        </div>
        <div className="flex gap-2">
          <input
            readOnly
            value={fullLink}
            data-testid="referral-link"
            className="flex-1 min-w-0 p-2.5 rounded-xl bg-[#020d24]/60 border border-[#1E3559] text-xs font-mono text-[#d8e2ff] focus:outline-none"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            onClick={copy}
            data-testid="referral-copy"
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold cursor-pointer"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        {info.invitedBy && (
          <p className="text-[11px] font-mono text-[#8c90a0]">Invited by code <span className="text-[#afc6ff]">{info.invitedBy}</span></p>
        )}
      </div>

      {/* Commission earned */}
      <div className={`${card} flex flex-col gap-3`}>
        <div className="flex items-center gap-2 text-xs font-mono text-[#8c90a0]">
          <TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> Referral commission earned
          {earn && !earn.enabled && (
            <span className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/25">not active yet</span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wide text-[#8c90a0]">Total</div>
            <div className="font-mono font-bold text-emerald-400 text-lg truncate" data-testid="referral-total">+{earn?.total ?? '0'} BANA</div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wide text-[#8c90a0]">Matching</div>
            <div className="font-mono font-bold text-white truncate">{earn?.matching ?? '0'}</div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wide text-[#8c90a0]">Boost</div>
            <div className="font-mono font-bold text-white truncate">{earn?.boost ?? '0'}</div>
          </div>
        </div>
        {earn && earn.recent.length > 0 && (
          <div className="flex flex-col gap-1 pt-1 border-t border-[#1E3559]/60">
            <div className="text-[10px] font-mono uppercase tracking-wide text-[#8c90a0]">Recent days</div>
            {earn.recent.slice(0, 5).map((r, i) => (
              <div key={i} className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-[#8c90a0]">{new Date(r.paidAt).toLocaleString()}</span>
                <span className="text-emerald-400">+{r.total} BANA <span className="text-[#56607a]">({r.layer1}+{r.layer2})</span></span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
