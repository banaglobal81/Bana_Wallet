'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Sprout, Plus, Loader2, Check, X, Power, Trash2, Users } from 'lucide-react';
import {
  listStakingProducts, createStakingProduct, updateStakingProduct, deleteStakingProduct, listStakingPositions,
  type AdminStakingProduct, type AdminStakePosition, type StakingProductInput,
} from '@/utils/adminApi';

const EMPTY: StakingProductInput = { coin: '', name: '', termDays: 30, dailyRatePct: '', minAmount: '', maxAmount: '', capacity: '' };

export default function AdminStakingPage() {
  const t = useTranslations('adminStaking');
  const [products, setProducts] = useState<AdminStakingProduct[]>([]);
  const [positions, setPositions] = useState<AdminStakePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<StakingProductInput>(EMPTY);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, pos] = await Promise.all([listStakingProducts(), listStakingPositions()]);
      setProducts(p); setPositions(pos);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

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
        <button onClick={() => setShowForm((v) => !v)} className="self-start inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-sm font-bold cursor-pointer">
          <Plus className="h-4 w-4" /> {t('newProduct')}
        </button>
      </header>

      {error && <div className="px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm">{error}</div>}

      {/* Create form */}
      {showForm && (
        <div className="p-6 rounded-2xl bg-[#112643]/70 border border-amber-500/20 flex flex-col gap-4">
          <h3 className="font-bold text-white text-sm">{t('newProduct')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <label className="flex flex-col gap-1"><span className="text-[11px] font-mono text-[#8c90a0]">{t('coin')}</span><input className={field} value={form.coin} onChange={(e) => setForm({ ...form, coin: e.target.value })} placeholder="USDT" /></label>
            <label className="flex flex-col gap-1"><span className="text-[11px] font-mono text-[#8c90a0]">{t('name')}</span><input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('namePlaceholder')} /></label>
            <label className="flex flex-col gap-1"><span className="text-[11px] font-mono text-[#8c90a0]">{t('termDays')}</span><input className={field} type="number" min={1} value={form.termDays} onChange={(e) => setForm({ ...form, termDays: Number(e.target.value) })} /></label>
            <label className="flex flex-col gap-1"><span className="text-[11px] font-mono text-[#8c90a0]">{t('dailyRate')}</span><input className={field} value={form.dailyRatePct} onChange={(e) => setForm({ ...form, dailyRatePct: e.target.value })} placeholder="0.05" /></label>
            <label className="flex flex-col gap-1"><span className="text-[11px] font-mono text-[#8c90a0]">{t('minOpt')}</span><input className={field} value={form.minAmount ?? ''} onChange={(e) => setForm({ ...form, minAmount: e.target.value })} placeholder="—" /></label>
            <label className="flex flex-col gap-1"><span className="text-[11px] font-mono text-[#8c90a0]">{t('maxOpt')}</span><input className={field} value={form.maxAmount ?? ''} onChange={(e) => setForm({ ...form, maxAmount: e.target.value })} placeholder="—" /></label>
            <label className="flex flex-col gap-1"><span className="text-[11px] font-mono text-[#8c90a0]">{t('capacityOpt')}</span><input className={field} value={form.capacity ?? ''} onChange={(e) => setForm({ ...form, capacity: e.target.value })} placeholder="—" /></label>
          </div>
          <p className="text-[11px] font-mono text-[#8c90a0]">{t('rateHint')}</p>
          <div className="flex gap-2">
            <button disabled={busy} onClick={create} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold cursor-pointer">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {t('create')}</button>
            <button disabled={busy} onClick={() => { setShowForm(false); setForm(EMPTY); }} className="px-4 py-2.5 rounded-xl bg-[#020d24]/60 hover:bg-[#112643] text-[#8c90a0] hover:text-white text-sm font-bold border border-[#1E3559]/80 cursor-pointer">{t('cancel')}</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs font-mono text-[#8c90a0] py-6">{t('loading')}</p>
      ) : (
        <>
          {/* Products */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-[#d8e2ff]">{t('productsTitle')}</h2>
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
                      <tr key={p.id} className="hover:bg-[#112643]/40">
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
                            <button disabled={busy} onClick={() => toggle(p)} title={p.status === 'OPEN' ? t('close') : t('open')} className="p-1.5 rounded-lg border border-[#1E3559] bg-[#020d24]/50 hover:bg-[#1e3459] text-[#8c90a0] hover:text-white cursor-pointer disabled:opacity-50"><Power className="h-3.5 w-3.5" /></button>
                            {p.positionCount === 0 && (
                              <button disabled={busy} onClick={() => remove(p)} title={t('delete')} className="p-1.5 rounded-lg border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/15 text-rose-400 cursor-pointer disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>
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
                        <td className="px-4 py-3 text-right font-mono text-emerald-400">+{p.accruedInterest}</td>
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
