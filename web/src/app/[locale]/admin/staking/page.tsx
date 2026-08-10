'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import Decimal from 'decimal.js';
import { Sprout, Plus, Loader2, Check, X, Power, Trash2, Users, Pencil, Play, TriangleAlert } from 'lucide-react';
import {
  listStakingProducts, createStakingProduct, updateStakingProduct, deleteStakingProduct, listStakingPositions, getStakingStats,
  runStakingSettlement, getStakingRunStatus, getReferralOverview, grantStakePosition,
  type AdminStakingProduct, type AdminStakePosition, type StakingProductInput, type AdminStakingStat, type StakingRunStatus, type ReferralOverview,
} from '@/utils/adminApi';
import { formatLedgerAmount } from '@/utils/adminLedgerFormat';
import { StakingLiabilitySection } from '@/components/admin/StakingLiabilitySection';
import { StakingIncidentBanner } from '@/components/admin/StakingIncidentBanner';

const EMPTY: StakingProductInput = { coin: 'BANA', name: '', termDays: 30, dailyRatePct: '', minAmount: '', maxAmount: '', capacity: '' };

// Fields an existing product can be edited to (coin + term are fixed after creation).
type EditForm = { name: string; dailyRatePct: string; minAmount: string; maxAmount: string; capacity: string };

// D-1 (staking-auto-renew-ruling.md R-1 / staking-auto-renew-copy-spec.md §3.1): true iff the
// typed rate is a lower value than the product's currently saved rate. decimal.js only — '0.050'
// and '0.05' must compare equal (show nothing), never Number()/parseFloat().
function isRateLowering(newRate: string, oldRate: string): boolean {
  if (newRate.trim() === '') return false;
  try {
    return new Decimal(newRate).lt(new Decimal(oldRate));
  } catch {
    return false;
  }
}

// Pending confirmation for a rate-lowering save (copy-spec §3.4) — set on Save, cleared on
// Cancel or once the save completes. Purely a disclosure step: does not alter PATCH's decision logic.
type ConfirmLower = { id: string; productName: string; newRate: string; oldRate: string; count: number };

export default function AdminStakingPage() {
  const t = useTranslations('adminStaking');
  const [products, setProducts] = useState<AdminStakingProduct[]>([]);
  const [positions, setPositions] = useState<AdminStakePosition[]>([]);
  // A8 fix (admin-staking-debt-visibility-frd.md §5.4 E-1): `stats === null` +
  // `statsError` set is a load FAILURE, distinct from `stats === []` (loaded,
  // genuinely zero positions). Never collapse the two — that's the bug this
  // FRD exists to fix.
  const [stats, setStats] = useState<AdminStakingStat[] | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [referral, setReferral] = useState<ReferralOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<StakingProductInput>(EMPTY);
  const [showForm, setShowForm] = useState(false);

  // Settlement (daily payout) run + status.
  const [status, setStatus] = useState<StakingRunStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);

  // Inline product edit.
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: '', dailyRatePct: '', minAmount: '', maxAmount: '', capacity: '' });
  // D-1 rate-lowering confirmation interstitial (copy-spec §3.4) — non-null while awaiting
  // explicit admin acknowledgment of the auto-renew refusal count.
  const [confirmLower, setConfirmLower] = useState<ConfirmLower | null>(null);

  // Grant a staking position to a user (bonus/promotion).
  const [grantEmail, setGrantEmail] = useState('');
  const [grantProductId, setGrantProductId] = useState('');
  const [grantAmount, setGrantAmount] = useState('');
  const [grantMsg, setGrantMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, pos, run, ref] = await Promise.all([
        listStakingProducts(), listStakingPositions(),
        getStakingRunStatus().catch(() => null),
        getReferralOverview().catch(() => null),
      ]);
      setProducts(p); setPositions(pos); setStatus(run); setReferral(ref);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }

    // Liability stats are fetched (and their failure tracked) independently of
    // the rest of the page — a stats-fetch failure must not blank the whole
    // page, and the rest of the page loading must not hide a stats failure.
    try {
      const st = await getStakingStats();
      setStats(st);
      setStatsError(null);
    } catch (e) {
      setStats(null);
      setStatsError((e as Error).message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Grant a staking position to a user — no hub balance needed (BANA is ours).
  const grant = async () => {
    setBusy(true); setError(null); setGrantMsg(null);
    try {
      const product = products.find((p) => p.id === grantProductId);
      await grantStakePosition({ email: grantEmail.trim(), productId: grantProductId, amount: grantAmount.trim() });
      setGrantMsg(t('grantSuccess', {
        amount: grantAmount.trim(),
        coin: product?.coin ?? '',
        email: grantEmail.trim(),
      }));
      setGrantEmail(''); setGrantAmount('');
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const runSettlement = async () => {
    setRunning(true); setError(null); setRunMsg(null);
    try {
      const r = await runStakingSettlement();
      // A4-C1 (docs/specs/staking-auto-renew-assumption-ruling.md §4): a
      // RENEWAL_DEFERRED outcome can occur with daysCredited === 0 (a position
      // already fully paid, still retrying a stalled renewal) — the noop
      // branch must not swallow that. Fall into the result message whenever
      // there is anything to report, not only when new days were credited.
      setRunMsg(r.daysCredited > 0 || r.matured > 0 || r.renewalsDeferred > 0
        ? t('settlement.runResult', { amount: r.totalPaid, coin: 'BANA', days: r.daysCredited, matured: r.matured, deferred: r.renewalsDeferred })
        : t('settlement.runResultNoop', { n: r.processed }));
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setRunning(false); }
  };

  const startEdit = (p: AdminStakingProduct) => {
    setError(null);
    setEditId(p.id);
    setConfirmLower(null);
    setEditForm({
      name: p.name, dailyRatePct: p.dailyRatePct,
      minAmount: p.minAmount ?? '', maxAmount: p.maxAmount ?? '', capacity: p.capacity ?? '',
    });
  };
  const cancelEdit = () => { setEditId(null); setConfirmLower(null); };
  const saveEdit = async (id: string) => {
    setBusy(true); setError(null);
    try {
      await updateStakingProduct(id, {
        name: editForm.name.trim(),
        dailyRatePct: editForm.dailyRatePct,
        minAmount: editForm.minAmount || null,
        maxAmount: editForm.maxAmount || null,
        capacity: editForm.capacity || null,
      });
      setEditId(null); setConfirmLower(null); await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  // D-1: Save is intercepted only when the typed rate is lower than the saved rate AND at least
  // one ACTIVE position on the product has auto-renew on (copy-spec §3.1). Otherwise Save proceeds
  // in one click exactly as before — this must not add friction to the common path (§3.5).
  const handleSaveClick = (p: AdminStakingProduct) => {
    if (isRateLowering(editForm.dailyRatePct, p.dailyRatePct) && p.autoRenewActiveCount > 0) {
      setConfirmLower({
        id: p.id, productName: p.name,
        newRate: editForm.dailyRatePct, oldRate: p.dailyRatePct, count: p.autoRenewActiveCount,
      });
      return;
    }
    saveEdit(p.id);
  };
  const confirmSaveLower = () => {
    if (!confirmLower) return;
    saveEdit(confirmLower.id);
  };

  const create = async () => {
    setBusy(true); setError(null);
    try {
      await createStakingProduct({
        ...form, coin: form.coin.trim().toUpperCase(), name: form.name.trim(), termDays: Number(form.termDays),
        minAmount: form.minAmount || null, maxAmount: form.maxAmount || null, capacity: form.capacity || null,
      });
      setForm(EMPTY); setShowForm(false); await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const toggle = async (p: AdminStakingProduct) => {
    setBusy(true); setError(null);
    try { await updateStakingProduct(p.id, { status: p.status === 'OPEN' ? 'CLOSED' : 'OPEN' }); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const remove = async (p: AdminStakingProduct) => {
    setBusy(true); setError(null);
    try { await deleteStakingProduct(p.id); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const field = 'p-2.5 rounded-xl bg-[#020d24]/60 border border-[#1E3559] text-sm text-[#d8e2ff] placeholder-[#8c90a0] focus:outline-none focus:border-amber-500/60 transition-colors';
  const POS_STYLE: Record<string, string> = {
    ACTIVE: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/25',
    MATURED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
    // P-6: this state is unreachable under current code (INV-1). If it ever
    // renders, StakingIncidentBanner fires alongside it — kept for that case.
    PAID: 'bg-slate-500/10 text-slate-300 border-slate-500/25',
  };

  return (
    <div className="flex-1 min-h-full bg-[#06132a] text-[#d8e2ff] p-4 sm:p-6 lg:p-8 flex flex-col gap-6 overflow-y-auto">
      <header className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center pb-2 border-b border-[#1E3559]/40">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <Sprout className="h-7 w-7 text-emerald-400" /> {t('pageTitle')}
          </h1>
          <p className="text-xs sm:text-sm text-[#8c90a0] mt-1 font-mono">{t('pageSubtitle')}</p>
        </div>
        <button data-testid="new-product-btn" onClick={() => setShowForm((v) => !v)} className="self-start inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-sm font-bold cursor-pointer">
          <Plus className="h-4 w-4" /> {t('newProduct')}
        </button>
      </header>

      {/* §5.5 — the one non-dismissible alarm on this screen. Above the error banner (INV violation trumps a routine fetch error). */}
      <StakingIncidentBanner stats={stats} />

      {error && <div className="px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm">{error}</div>}

      {loading ? (
        <p className="text-xs font-mono text-[#8c90a0] py-6">{t('loading')}</p>
      ) : (
        <>
          {/* §4.1 【1】 — liability overview, replacing the old undifferentiated totalPaid grid. */}
          <StakingLiabilitySection stats={stats} error={statsError} onRetry={load} />

          {/* §4.1 【2】/§4.5 — daily accrual status + manual run. Moved directly under liability
              so "how much is owed" and "how fast it's growing" read as one pair. */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <div className="flex flex-col gap-1 text-xs font-mono text-[#8c90a0]">
              <span className="text-[11px] uppercase tracking-wider text-[#d8e2ff] font-bold">{t('settlement.title')}</span>
              <span>
                {t('settlement.lastAccrual', { when: status?.lastPayoutAt ? new Date(status.lastPayoutAt).toLocaleString() : t('settlement.never') })}
                {'  ·  '}{t('settlement.accruedToday', { amount: formatLedgerAmount(status?.totalPaidToday ?? '0').display, count: status?.payoutsToday ?? 0 })}
                {'  ·  '}{t('settlement.activeN', { n: status?.activeCount ?? 0 })}
              </span>
              {runMsg && <span data-testid="settlement-msg" className="text-[#afc6ff]">{runMsg}</span>}
            </div>
            <button
              data-testid="run-settlement"
              disabled={running}
              onClick={runSettlement}
              title={t('settlement.runNowTitle')}
              className="self-start inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold cursor-pointer whitespace-nowrap"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} {t('settlement.runNow')}
            </button>
          </div>

          {/* §4.1 【3】 — create form */}
          {showForm && (
            <div className="p-6 rounded-2xl bg-[#112643]/70 border border-amber-500/20 flex flex-col gap-4">
              <h3 className="font-bold text-white text-sm">{t('newProduct')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <label className="flex flex-col gap-1"><span className="text-[11px] font-mono text-[#8c90a0]">{t('coin')}</span><input className={`${field} opacity-70 cursor-not-allowed`} value="BANA" readOnly title="Only BANA is stakeable" /></label>
                <label className="flex flex-col gap-1"><span className="text-[11px] font-mono text-[#8c90a0]">{t('name')}</span><input data-testid="np-name" className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('namePlaceholder')} /></label>
                <label className="flex flex-col gap-1"><span className="text-[11px] font-mono text-[#8c90a0]">{t('termDays')}</span><input data-testid="np-term" className={field} type="number" min={1} value={form.termDays} onChange={(e) => setForm({ ...form, termDays: Number(e.target.value) })} /></label>
                <label className="flex flex-col gap-1"><span className="text-[11px] font-mono text-[#8c90a0]">{t('dailyRate')}</span><input data-testid="np-rate" className={field} value={form.dailyRatePct} onChange={(e) => setForm({ ...form, dailyRatePct: e.target.value })} placeholder="0.05" /></label>
                <label className="flex flex-col gap-1"><span className="text-[11px] font-mono text-[#8c90a0]">{t('minOpt')}</span><input className={field} value={form.minAmount ?? ''} onChange={(e) => setForm({ ...form, minAmount: e.target.value })} placeholder="—" /></label>
                <label className="flex flex-col gap-1"><span className="text-[11px] font-mono text-[#8c90a0]">{t('maxOpt')}</span><input className={field} value={form.maxAmount ?? ''} onChange={(e) => setForm({ ...form, maxAmount: e.target.value })} placeholder="—" /></label>
                <label className="flex flex-col gap-1"><span className="text-[11px] font-mono text-[#8c90a0]">{t('capacityOpt')}</span><input className={field} value={form.capacity ?? ''} onChange={(e) => setForm({ ...form, capacity: e.target.value })} placeholder="—" /></label>
              </div>
              <p className="text-[11px] font-mono text-[#8c90a0]">{t('rateHint')}</p>
              <div className="flex gap-2">
                <button data-testid="np-submit" disabled={busy} onClick={create} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold cursor-pointer">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {t('create')}</button>
                <button disabled={busy} onClick={() => { setShowForm(false); setForm(EMPTY); }} className="px-4 py-2.5 rounded-xl bg-[#020d24]/60 hover:bg-[#112643] text-[#8c90a0] hover:text-white text-sm font-bold border border-[#1E3559]/80 cursor-pointer">{t('cancel')}</button>
              </div>
            </div>
          )}

          {/* §4.1 【3】 — products list */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-[#d8e2ff]">{t('productsTitle')}</h2>

            {/* Inline edit — change an existing product's rate / limits (coin + term are fixed) */}
            {editId && (() => {
              const p = products.find((x) => x.id === editId);
              if (!p) return null;
              return (
                <div className="p-5 rounded-2xl bg-[#112643]/70 border border-amber-500/20 flex flex-col gap-4">
                  <h3 className="font-bold text-white text-sm">Edit {p.coin} {t('daysN', { n: p.termDays })}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <label className="flex flex-col gap-1"><span className="text-[11px] font-mono text-[#8c90a0]">{t('name')}</span><input className={field} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></label>
                    <label className="flex flex-col gap-1"><span className="text-[11px] font-mono text-[#8c90a0]">{t('dailyRate')}</span><input data-testid="edit-rate" className={field} value={editForm.dailyRatePct} onChange={(e) => setEditForm({ ...editForm, dailyRatePct: e.target.value })} placeholder="0.05" /></label>
                    <label className="flex flex-col gap-1"><span className="text-[11px] font-mono text-[#8c90a0]">{t('minOpt')}</span><input className={field} value={editForm.minAmount} onChange={(e) => setEditForm({ ...editForm, minAmount: e.target.value })} placeholder="—" /></label>
                    <label className="flex flex-col gap-1"><span className="text-[11px] font-mono text-[#8c90a0]">{t('maxOpt')}</span><input className={field} value={editForm.maxAmount} onChange={(e) => setEditForm({ ...editForm, maxAmount: e.target.value })} placeholder="—" /></label>
                    <label className="flex flex-col gap-1"><span className="text-[11px] font-mono text-[#8c90a0]">{t('capacityOpt')}</span><input className={field} value={editForm.capacity} onChange={(e) => setEditForm({ ...editForm, capacity: e.target.value })} placeholder="—" /></label>
                  </div>

                  {/* D-1 inline warning — live as the admin types a lower rate (copy-spec §3.3) */}
                  {isRateLowering(editForm.dailyRatePct, p.dailyRatePct) && p.autoRenewActiveCount > 0 && (
                    <div data-testid="rate-lower-inline-warning" className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-100 text-xs leading-relaxed flex flex-col gap-2">
                      <p className="font-bold text-amber-300 flex items-center gap-1.5"><TriangleAlert className="h-3.5 w-3.5 shrink-0" /> {t('autoRenewWarning.inlineTitle', { count: p.autoRenewActiveCount })}</p>
                      <p>{t('autoRenewWarning.inlineBody', { count: p.autoRenewActiveCount, productName: p.name })}</p>
                      <p>{t('autoRenewWarning.inlineRestore')}</p>
                      <p className="text-amber-200/80">{t('autoRenewWarning.inlineSnapshot')}</p>
                    </div>
                  )}

                  {/* D-1 confirmation interstitial — interposed on Save only under the same condition (copy-spec §3.4) */}
                  {confirmLower && confirmLower.id === p.id ? (
                    <div data-testid="rate-lower-confirm" className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col gap-3">
                      <p className="font-bold text-white text-sm">{t('autoRenewWarning.confirmTitle', { productName: confirmLower.productName })}</p>
                      <p className="text-xs font-mono text-[#d8e2ff]">{t('autoRenewWarning.confirmRates', { newRate: confirmLower.newRate, oldRate: confirmLower.oldRate })}</p>
                      <p className="text-xs text-amber-100">{t('autoRenewWarning.confirmBody', { count: confirmLower.count })}</p>
                      <p className="text-xs text-amber-200/80">{t('autoRenewWarning.confirmSnapshot')}</p>
                      <div className="flex gap-2">
                        <button data-testid="confirm-lower-save" disabled={busy} onClick={confirmSaveLower} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-[#06132a] text-sm font-bold cursor-pointer">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {t('autoRenewWarning.confirmYes')}</button>
                        <button data-testid="confirm-lower-cancel" disabled={busy} onClick={() => setConfirmLower(null)} className="px-4 py-2.5 rounded-xl bg-[#020d24]/60 hover:bg-[#112643] text-[#8c90a0] hover:text-white text-sm font-bold border border-[#1E3559]/80 cursor-pointer">{t('autoRenewWarning.confirmCancel')}</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button data-testid="edit-save" disabled={busy} onClick={() => handleSaveClick(p)} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold cursor-pointer">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save</button>
                      <button disabled={busy} onClick={cancelEdit} className="px-4 py-2.5 rounded-xl bg-[#020d24]/60 hover:bg-[#112643] text-[#8c90a0] hover:text-white text-sm font-bold border border-[#1E3559]/80 cursor-pointer">{t('cancel')}</button>
                    </div>
                  )}
                </div>
              );
            })()}

            {products.length === 0 ? (
              <div className="p-6 rounded-2xl bg-[#112643]/70 border border-[#1E3559] text-center text-sm text-[#8c90a0]">{t('noProducts')}</div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-[#1E3559]">
                <table className="w-full text-sm">
                  <thead className="bg-[#0a1b33] text-[11px] font-mono uppercase text-[#8c90a0]">
                    <tr>
                      <th className="text-left px-4 py-3">{t('name')}</th>
                      <th className="text-left px-4 py-3">{t('coin')}</th>
                      <th className="text-right px-4 py-3">{t('term')}</th>
                      <th className="text-right px-4 py-3">{t('dailyRate')}</th>
                      <th className="text-right px-4 py-3">{t('apr')}</th>
                      <th className="text-right px-4 py-3">{t('staked')}</th>
                      <th className="text-center px-4 py-3">{t('status')}</th>
                      <th className="text-right px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E3559]/50">
                    {products.map((p) => (
                      <tr key={p.id} data-testid="product-row" data-term={p.termDays} className="hover:bg-[#112643]/40">
                        <td className="px-4 py-3 font-bold text-white">{p.name}</td>
                        <td className="px-4 py-3 font-mono text-[#afc6ff]">{p.coin}</td>
                        <td className="px-4 py-3 text-right font-mono">{t('daysN', { n: p.termDays })}</td>
                        <td className="px-4 py-3 text-right font-mono">{p.dailyRatePct}%</td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-400 font-bold">{p.aprPct}%</td>
                        <td className="px-4 py-3 text-right font-mono">{p.totalStaked} <span className="text-[10px] text-[#8c90a0]">({p.positionCount})</span></td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${p.status === 'OPEN' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' : 'bg-slate-500/10 text-slate-400 border-slate-500/25'}`}>{t(`status_${p.status}` as 'status_OPEN')}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <button data-testid="p-edit" disabled={busy} onClick={() => (editId === p.id ? cancelEdit() : startEdit(p))} title="Edit" className={`p-1.5 rounded-lg border cursor-pointer disabled:opacity-50 ${editId === p.id ? 'border-amber-500/40 bg-amber-500/15 text-amber-300' : 'border-[#1E3559] bg-[#020d24]/50 hover:bg-[#1e3459] text-[#8c90a0] hover:text-white'}`}><Pencil className="h-3.5 w-3.5" /></button>
                            <button data-testid="p-toggle" disabled={busy} onClick={() => toggle(p)} title={p.status === 'OPEN' ? t('close') : t('open')} className="p-1.5 rounded-lg border border-[#1E3559] bg-[#020d24]/50 hover:bg-[#1e3459] text-[#8c90a0] hover:text-white cursor-pointer disabled:opacity-50"><Power className="h-3.5 w-3.5" /></button>
                            {p.positionCount === 0 && (
                              <button data-testid="p-delete" disabled={busy} onClick={() => remove(p)} title={t('delete')} className="p-1.5 rounded-lg border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/15 text-rose-400 cursor-pointer disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* §4.1 【4】 — Referral commissions (대·소실적 매칭 + 유니레벨 부스트) */}
          {referral && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-[#d8e2ff] flex items-center gap-2">
                Referral commissions
                {!referral.enabled && <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/25">flag OFF</span>}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl bg-[#112643]/70 border border-[#1E3559]">
                  <div className="text-[10px] font-mono uppercase tracking-wide text-[#8c90a0]">Total paid</div>
                  <div className="font-mono font-bold text-emerald-400 truncate">+{referral.grandTotal} BANA</div>
                </div>
                <div className="p-4 rounded-2xl bg-[#112643]/70 border border-[#1E3559]">
                  <div className="text-[10px] font-mono uppercase tracking-wide text-[#8c90a0]">Uplines (with downline)</div>
                  <div className="font-mono font-bold text-white">{referral.uplines}</div>
                </div>
                <div className="p-4 rounded-2xl bg-[#112643]/70 border border-[#1E3559]">
                  <div className="text-[10px] font-mono uppercase tracking-wide text-[#8c90a0]">Earners</div>
                  <div className="font-mono font-bold text-white">{referral.earners.length}</div>
                </div>
              </div>
              {referral.earners.length > 0 && (
                <div className="overflow-x-auto rounded-2xl border border-[#1E3559]">
                  <table className="w-full text-sm">
                    <thead className="bg-[#0a1b33] text-[11px] font-mono uppercase text-[#8c90a0]">
                      <tr>
                        <th className="text-left px-4 py-3">User</th>
                        <th className="text-right px-4 py-3">Matching</th>
                        <th className="text-right px-4 py-3">Boost</th>
                        <th className="text-right px-4 py-3">Total</th>
                        <th className="text-right px-4 py-3">Days</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E3559]/50">
                      {referral.earners.map((e) => (
                        <tr key={e.email} className="hover:bg-[#112643]/40">
                          <td className="px-4 py-3 font-mono text-[#afc6ff] truncate max-w-[220px]">{e.email}</td>
                          <td className="px-4 py-3 text-right font-mono text-[#8c90a0]">{e.matching}</td>
                          <td className="px-4 py-3 text-right font-mono text-[#8c90a0]">{e.boost}</td>
                          <td className="px-4 py-3 text-right font-mono text-emerald-400 font-bold">+{e.total}</td>
                          <td className="px-4 py-3 text-right font-mono">{e.days}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* §4.1 【5】 — Grant a staking position to a user (bonus / promotion) */}
          <section className="flex flex-col gap-3">
            <div className="p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-3">
              <div>
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-[#d8e2ff] flex items-center gap-2">
                  <Sprout className="h-4 w-4 text-emerald-400" /> {t('grantTitle')}
                </h2>
                <p className="text-[11px] text-[#8c90a0] mt-1 leading-relaxed">{t('grantHint')}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[2fr_2fr_1fr_auto] gap-2">
                <input
                  className={field}
                  value={grantEmail}
                  onChange={(e) => setGrantEmail(e.target.value)}
                  placeholder={t('grantEmailPlaceholder')}
                />
                <select
                  className={field}
                  value={grantProductId}
                  onChange={(e) => setGrantProductId(e.target.value)}
                >
                  <option value="">{t('grantProductPlaceholder')}</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} · {p.coin} · {p.termDays}d</option>
                  ))}
                </select>
                <input
                  className={field}
                  value={grantAmount}
                  onChange={(e) => setGrantAmount(e.target.value)}
                  placeholder={t('grantAmountPlaceholder')}
                />
                <button
                  disabled={busy || !grantEmail.trim() || !grantProductId || !grantAmount.trim()}
                  onClick={grant}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold cursor-pointer whitespace-nowrap"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {t('grantAction')}
                </button>
              </div>
              {grantMsg && (
                <p className="text-xs text-emerald-400 font-mono bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3 py-2">{grantMsg}</p>
              )}
            </div>
          </section>

          {/* §4.1 【6】 — Positions (§4.4 P-1..P-6) */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-[#d8e2ff] flex items-center gap-2"><Users className="h-4 w-4 text-[#528dff]" /> {t('positionsTitle')}</h2>
            {positions.length === 0 ? (
              <div className="p-6 rounded-2xl bg-[#112643]/70 border border-[#1E3559] text-center text-sm text-[#8c90a0]">{t('noPositions')}</div>
            ) : (
              <div className="flex flex-col gap-2">
                {/* P-4: group caption over the two ledger columns. */}
                <p className="text-[11px] text-[#8c90a0] font-mono px-1">{t('ledgerColsNote')}</p>
                <div className="overflow-x-auto rounded-2xl border border-[#1E3559]">
                  <table className="w-full text-sm">
                    <thead className="bg-[#0a1b33] text-[11px] font-mono uppercase text-[#8c90a0]">
                      <tr>
                        <th className="text-left px-4 py-3">{t('user')}</th>
                        <th className="text-left px-4 py-3">{t('product')}</th>
                        <th className="text-right px-4 py-3">{t('principal')}</th>
                        <th className="text-right px-4 py-3">{t('accrued')}</th>
                        <th className="text-right px-4 py-3">{t('unpaidCol')}</th>
                        <th className="text-left px-4 py-3">{t('matures')}</th>
                        <th className="text-center px-4 py-3">{t('status')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E3559]/50">
                      {positions.map((p) => {
                        const unpaid = formatLedgerAmount(p.paidInterest);
                        return (
                          <tr key={p.id} className="hover:bg-[#112643]/40">
                            <td className="px-4 py-3 font-mono text-[#afc6ff] truncate max-w-[180px]">
                              {p.email}
                              {/* P-5: grant marker — derived server-side from grantedByAdminId (admin route only). */}
                              {p.isGrant && (
                                <span data-testid="grant-badge" className="ml-1.5 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/25 align-middle">
                                  {t('grantBadge')}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">{p.productName}</td>
                            <td className="px-4 py-3 text-right font-mono text-white">{p.principal} {p.coin}</td>
                            <td className="px-4 py-3 text-right font-mono text-[#8c90a0]">{p.accruedInterest}</td>
                            {/* P-2: no emerald, no "+" prefix — this is unpaid ledger interest, not a credit. */}
                            <td
                              className="px-4 py-3 text-right font-mono text-amber-300 font-bold"
                              title={unpaid.truncated ? p.paidInterest : undefined}
                            >
                              {unpaid.display} {p.coin}
                            </td>
                            <td className="px-4 py-3 font-mono text-[10px] text-[#8c90a0]">{new Date(p.maturityAt).toLocaleDateString()}</td>
                            <td className="px-4 py-3 text-center"><span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${POS_STYLE[p.status]}`}>{p.status}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
