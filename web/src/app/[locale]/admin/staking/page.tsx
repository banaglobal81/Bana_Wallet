'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Sprout, Plus, Loader2, Check, X, Power, Trash2, Users, Lock, Coins, Pencil, Play } from 'lucide-react';
import {
  listStakingProducts, createStakingProduct, updateStakingProduct, deleteStakingProduct, listStakingPositions, getStakingStats,
  runStakingSettlement, getStakingRunStatus, getReferralOverview,
  type AdminStakingProduct, type AdminStakePosition, type StakingProductInput, type AdminStakingStat, type StakingRunStatus, type ReferralOverview,
} from '@/utils/adminApi';

const EMPTY: StakingProductInput = { coin: 'BANA', name: '', termDays: 30, dailyRatePct: '', minAmount: '', maxAmount: '', capacity: '' };

// Fields an existing product can be edited to (coin + term are fixed after creation).
type EditForm = { name: string; dailyRatePct: string; minAmount: string; maxAmount: string; capacity: string };

export default function AdminStakingPage() {
  const t = useTranslations('adminStaking');
  const [products, setProducts] = useState<AdminStakingProduct[]>([]);
  const [positions, setPositions] = useState<AdminStakePosition[]>([]);
  const [stats, setStats] = useState<AdminStakingStat[]>([]);
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, pos, st, run, ref] = await Promise.all([
        listStakingProducts(), listStakingPositions(),
        getStakingStats().catch(() => []), getStakingRunStatus().catch(() => null),
        getReferralOverview().catch(() => null),
      ]);
      setProducts(p); setPositions(pos); setStats(st); setStatus(run); setReferral(ref);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const runSettlement = async () => {
    setRunning(true); setError(null); setRunMsg(null);
    try {
      const r = await runStakingSettlement();
      setRunMsg(r.daysCredited > 0
        ? `Paid ${r.totalPaid} across ${r.daysCredited} day(s); ${r.matured} matured.`
        : `Up to date — nothing new to pay (${r.processed} active).`);
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setRunning(false); }
  };

  const startEdit = (p: AdminStakingProduct) => {
    setError(null);
    setEditId(p.id);
    setEditForm({
      name: p.name, dailyRatePct: p.dailyRatePct,
      minAmount: p.minAmount ?? '', maxAmount: p.maxAmount ?? '', capacity: p.capacity ?? '',
    });
  };
  const cancelEdit = () => { setEditId(null); };
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
      setEditId(null); await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
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

      {error && <div className="px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm">{error}</div>}

      {/* Daily settlement — status + manual run */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div className="flex flex-col gap-1 text-xs font-mono text-[#8c90a0]">
          <span className="text-[11px] uppercase tracking-wider text-[#d8e2ff] font-bold">Daily settlement</span>
          <span>
            Last interest paid:{' '}
            <span className="text-[#afc6ff]">{status?.lastPayoutAt ? new Date(status.lastPayoutAt).toLocaleString() : 'never'}</span>
            {'  ·  '}Paid today: <span className="text-emerald-400">{status?.totalPaidToday ?? '0'}</span> ({status?.payoutsToday ?? 0})
            {'  ·  '}<span className="text-[#afc6ff]">{status?.activeCount ?? 0}</span> active
          </span>
          {runMsg && <span data-testid="settlement-msg" className="text-emerald-300">{runMsg}</span>}
        </div>
        <button
          data-testid="run-settlement"
          disabled={running}
          onClick={runSettlement}
          title="Run the daily interest payout now (idempotent)"
          className="self-start inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold cursor-pointer whitespace-nowrap"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run settlement now
        </button>
      </div>

      {/* Create form */}
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

      {loading ? (
        <p className="text-xs font-mono text-[#8c90a0] py-6">{t('loading')}</p>
      ) : (
        <>
          {/* Liability overview — real active principal + interest paid to date (per coin) */}
          {stats.length > 0 && (
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {stats.map((s) => (
                <div key={s.coin} className="p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-white"><Coins className="h-4 w-4 text-[#528dff]" /> {s.coin}</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-wide text-[#8c90a0] flex items-center gap-1"><Lock className="h-3 w-3" /> Active staked</div>
                      <div className="font-mono font-bold text-white truncate">{s.activePrincipal} {s.coin}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-wide text-[#8c90a0]">Interest paid</div>
                      <div className="font-mono font-bold text-emerald-400 truncate">+{s.totalPaid} {s.coin}</div>
                    </div>
                  </div>
                  <div className="text-[10px] font-mono text-[#8c90a0]">{s.activeCount} active · {s.totalCount} total positions</div>
                </div>
              ))}
            </section>
          )}

          {/* Referral commissions (대·소실적 매칭 + 유니레벨 부스트) */}
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

          {/* Products */}
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
                  <div className="flex gap-2">
                    <button data-testid="edit-save" disabled={busy} onClick={() => saveEdit(p.id)} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold cursor-pointer">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save</button>
                    <button disabled={busy} onClick={cancelEdit} className="px-4 py-2.5 rounded-xl bg-[#020d24]/60 hover:bg-[#112643] text-[#8c90a0] hover:text-white text-sm font-bold border border-[#1E3559]/80 cursor-pointer">{t('cancel')}</button>
                  </div>
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

          {/* Positions */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-[#d8e2ff] flex items-center gap-2"><Users className="h-4 w-4 text-[#528dff]" /> {t('positionsTitle')}</h2>
            {positions.length === 0 ? (
              <div className="p-6 rounded-2xl bg-[#112643]/70 border border-[#1E3559] text-center text-sm text-[#8c90a0]">{t('noPositions')}</div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-[#1E3559]">
                <table className="w-full text-sm">
                  <thead className="bg-[#0a1b33] text-[11px] font-mono uppercase text-[#8c90a0]">
                    <tr>
                      <th className="text-left px-4 py-3">{t('user')}</th>
                      <th className="text-left px-4 py-3">{t('product')}</th>
                      <th className="text-right px-4 py-3">{t('principal')}</th>
                      <th className="text-right px-4 py-3">{t('accrued')}</th>
                      <th className="text-right px-4 py-3">Paid</th>
                      <th className="text-left px-4 py-3">{t('matures')}</th>
                      <th className="text-center px-4 py-3">{t('status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E3559]/50">
                    {positions.map((p) => (
                      <tr key={p.id} className="hover:bg-[#112643]/40">
                        <td className="px-4 py-3 font-mono text-[#afc6ff] truncate max-w-[180px]">{p.email}</td>
                        <td className="px-4 py-3">{p.productName}</td>
                        <td className="px-4 py-3 text-right font-mono text-white">{p.principal} {p.coin}</td>
                        <td className="px-4 py-3 text-right font-mono text-[#8c90a0]">+{p.accruedInterest}</td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-400 font-bold">+{p.paidInterest}</td>
                        <td className="px-4 py-3 font-mono text-[10px] text-[#8c90a0]">{new Date(p.maturityAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-center"><span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${POS_STYLE[p.status]}`}>{p.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
