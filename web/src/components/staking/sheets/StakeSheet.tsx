'use client';

import { useState } from 'react';
import Decimal from 'decimal.js';
import { useTranslations } from 'next-intl';
import { Loader2, Lock, Check } from 'lucide-react';
import CoinAvatar from '../../wallet/CoinAvatar';
import SheetShell from './SheetShell';
import { fullInterest } from '../../../lib/stakingMath';
import type { StakingProduct } from '../../../utils/stakingApi';

// docs/specs/staking-page-v2-screen-flow-frd.md §4.4 — S-STAKE. 3-step flow;
// no request goes out before STEP 3's confirm (per the FRD's own wording).
type Step = 1 | 2 | 3;

export default function StakeSheet({
  products,
  availableFor,
  autoRenewMaxTermDays,
  onSubmit,
  onClose,
}: {
  products: StakingProduct[];
  availableFor: (coin: string) => Decimal;
  autoRenewMaxTermDays: number;
  /** Throws a *localized* Error (the caller maps the server's stable error code first). */
  onSubmit: (productId: string, amount: string, autoRenew: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const t = useTranslations('staking');
  const ar = useTranslations('staking.autoRenew');

  const [step, setStep] = useState<Step>(1);
  const [product, setProduct] = useState<StakingProduct | null>(null);
  const [amount, setAmount] = useState('');
  const [autoRenewChecked, setAutoRenewChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const amtDec = (() => { try { return new Decimal(amount || 0); } catch { return new Decimal(0); } })();
  const avail = product ? availableFor(product.coin) : new Decimal(0);

  const openStep2 = (p: StakingProduct) => {
    setProduct(p); setAmount(''); setError(null); setAutoRenewChecked(false); setStep(2);
  };

  const handleConfirm = async () => {
    if (!product) return;
    setSubmitting(true); setError(null);
    try {
      await onSubmit(product.id, amtDec.toFixed(), autoRenewChecked);
      setDone(true);
      setTimeout(onClose, 1500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const title = step === 1 ? t('sheet.stakeTitle') : step === 2 ? t('sheet.amountTitle') : t('sheet.confirmTitle');

  return (
    <SheetShell title={title} step={t('sheet.step', { current: step, total: 3 })} onClose={onClose}>
      {done ? (
        <div data-testid="stake-success" className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-sm font-bold">
          <Check className="h-4 w-4" /> {t('stakeSuccess')}
        </div>
      ) : step === 1 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {products.length === 0 ? (
            <div className="col-span-full p-6 rounded-2xl bg-[#1E3559]/30 border border-[#1E3559] text-center text-sm text-[#8c90a0]">{t('noProducts')}</div>
          ) : (
            products.map((p) => (
              <button
                key={p.id}
                type="button"
                data-testid="stake-product-card"
                disabled={p.full}
                onClick={() => openStep2(p)}
                className="text-left bg-[#1E3559]/40 border border-[#1E3559] rounded-lg p-3 space-y-2 hover:border-[#2E7DFF] hover:bg-[#1E3559]/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <CoinAvatar symbol={p.coin} size={24} />
                  <span className="text-sm font-semibold text-white truncate">{p.name}</span>
                </div>
                {/* Non-band product: single daily rate. No band meter — this
                    launch has no band program at all (bandProgram = OFF),
                    so a meter component is never built here (L-8). */}
                <div className="text-base font-mono text-[#2E7DFF]">{t('dailyRate')}: {p.dailyRatePct}%</div>
                <div className="text-xs text-[#8c90a0]">{t('term')}: {t('daysN', { n: p.termDays })}</div>
                {(p.minAmount || p.maxAmount) && (
                  <div className="text-xs text-[#8c90a0]">
                    {p.minAmount ? `${t('min')} ${p.minAmount}` : ''}{p.minAmount && p.maxAmount ? ' · ' : ''}{p.maxAmount ? `${t('max')} ${p.maxAmount}` : ''} {p.coin}
                  </div>
                )}
                {p.full && <span className="inline-block text-xs font-semibold text-rose-400 bg-rose-500/10 px-2 py-1 rounded">{t('full')}</span>}
              </button>
            ))
          )}
        </div>
      ) : step === 2 && product ? (
        <div className="flex flex-col gap-3">
          <div className="flex justify-between text-xs font-mono text-[#8c90a0]">
            <span>{t('amount')}</span>
            <span>{t('available')}: {avail.toFixed()} {product.coin}</span>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-xl bg-[#020d24]/70 border border-[#1E3559]">
            <input
              value={amount}
              onChange={(e) => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v); }}
              placeholder="0.00"
              inputMode="decimal"
              className="bg-transparent text-lg font-bold font-mono text-white focus:outline-none w-full min-w-0"
            />
            <button type="button" onClick={() => setAmount(avail.toFixed())} className="px-2 py-1 bg-[#112643] hover:bg-[#1e3459] border border-[#1E3559] text-[#528dff] rounded text-[10px] font-bold cursor-pointer shrink-0">
              {t('max')}
            </button>
            <span className="font-mono text-sm text-[#afc6ff] font-bold shrink-0">{product.coin}</span>
          </div>

          {/* Contract terms — a single deterministic figure derived from the
              contracted rate × principal × term (L-4: allowed, this is not a
              forecast). Never a mid-range/projected estimate. */}
          {amtDec.gt(0) && (
            <div className="text-xs text-[#8c90a0] bg-[#1E3559]/40 p-3 rounded space-y-1">
              <p>{t('stakeSheet.contractTerms', {
                days: product.termDays,
                baseTotal: fullInterest(amtDec.toFixed(), product.dailyRatePct, product.termDays).toFixed(),
                coin: product.coin,
              })}</p>
              <p>{t('stakeSheet.notEstimate')}</p>
            </div>
          )}

          {product.termDays <= autoRenewMaxTermDays && (
            <label className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-[#020d24]/50 border border-[#1E3559]/70 cursor-pointer">
              <input
                type="checkbox"
                data-testid="autorenew-optin"
                checked={autoRenewChecked}
                onChange={(e) => setAutoRenewChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#528dff] cursor-pointer"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-xs font-bold text-white">{ar('optInLabel')}</span>
                <span className="text-[11px] font-mono text-[#8c90a0] leading-relaxed">{ar('optInHelp', { termDays: product.termDays })}</span>
              </span>
            </label>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={() => setStep(1)} className="px-4 py-2.5 rounded-xl bg-[#020d24]/60 hover:bg-[#112643] text-[#8c90a0] hover:text-white text-sm font-bold border border-[#1E3559]/80 cursor-pointer">
              {t('sheet.back')}
            </button>
            <button
              type="button"
              disabled={amtDec.lte(0) || amtDec.gt(avail)}
              onClick={() => setStep(3)}
              className="flex-1 py-2.5 rounded-xl bg-[#2E7DFF]/90 hover:bg-[#2E7DFF] text-white font-bold text-sm border border-[#2E7DFF] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('confirmStake')}
            </button>
          </div>
        </div>
      ) : step === 3 && product ? (
        <div className="flex flex-col gap-4">
          <div className="bg-[#1E3559]/40 border border-[#1E3559] rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[#8c90a0]">{t('amount')}</span><span className="font-mono text-white">{amtDec.toFixed()} {product.coin}</span></div>
            <div className="flex justify-between"><span className="text-[#8c90a0]">{t('term')}</span><span className="font-mono text-white">{t('daysN', { n: product.termDays })}</span></div>
            <div className="flex justify-between"><span className="text-[#8c90a0]">{t('dailyRate')}</span><span className="font-mono text-white">{product.dailyRatePct}%</span></div>
          </div>
          <p className="text-xs font-bold text-amber-300 leading-relaxed">{t('stakeSheet.lockNote')}</p>
          {autoRenewChecked && <p className="text-xs font-mono text-[#8c90a0] leading-relaxed">{ar('optInHelp', { termDays: product.termDays })}</p>}
          {error && <span data-testid="stake-error" className="text-[11px] text-rose-400 font-mono">{error}</span>}
          <div className="flex gap-2">
            <button type="button" disabled={submitting} onClick={() => setStep(2)} className="px-4 py-2.5 rounded-xl bg-[#020d24]/60 hover:bg-[#112643] text-[#8c90a0] hover:text-white text-sm font-bold border border-[#1E3559]/80 cursor-pointer disabled:opacity-50">
              {t('sheet.back')}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handleConfirm}
              className="flex-1 py-2.5 rounded-xl bg-[#2E7DFF]/90 hover:bg-[#2E7DFF] text-white font-bold text-sm border border-[#2E7DFF] cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} {t('confirmStake')}
            </button>
          </div>
        </div>
      ) : null}
    </SheetShell>
  );
}
