'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Coins, Plus, Loader2, Check, Trash2, Eye, EyeOff, X, Upload, ImageIcon, Pencil } from 'lucide-react';
import CoinAvatar from '@/components/wallet/CoinAvatar';
import {
  listCoins, createCoin, updateCoin, deleteCoin, uploadImage,
  type ManagedCoin, type CoinNetwork,
} from '@/utils/adminApi';

type NetRow = { code: string; contractAddress: string; decimals: string };
const EMPTY_NET: NetRow = { code: '', contractAddress: '', decimals: '18' };

export default function AdminCoinsPage() {
  const t = useTranslations('adminCoins');
  const [coins, setCoins] = useState<ManagedCoin[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [nets, setNets] = useState<NetRow[]>([{ ...EMPTY_NET }]);
  const [logoKey, setLogoKey] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Inline edit (rename + change contract addresses / networks).
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editNets, setEditNets] = useState<NetRow[]>([{ ...EMPTY_NET }]);

  const load = useCallback(async () => {
    setLoading(true);
    try { setCoins(await listCoins()); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const resetForm = () => { setSymbol(''); setName(''); setNets([{ ...EMPTY_NET }]); setLogoKey(null); setLogoPreview(null); setShowForm(false); };

  const onLogoPick = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true); setError(null);
    try {
      const key = await uploadImage(file, 'coin-logos');
      setLogoKey(key);
      setLogoPreview(URL.createObjectURL(file));
    } catch (e) { setError((e as Error).message); }
    finally { setUploading(false); }
  };

  const create = async () => {
    setBusy(true); setError(null);
    try {
      const networks: CoinNetwork[] = nets
        .filter((n) => n.code.trim() || n.contractAddress.trim())
        .map((n) => ({ code: n.code.trim().toUpperCase(), contractAddress: n.contractAddress.trim(), decimals: Number(n.decimals) }));
      await createCoin({ symbol: symbol.trim().toUpperCase(), name: name.trim(), networks, logoKey });
      resetForm(); await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const startEdit = (c: ManagedCoin) => {
    setError(null);
    setEditId(c.id);
    setEditName(c.name);
    setEditNets(
      c.networks.length
        ? c.networks.map((n) => ({ code: n.code, contractAddress: n.contractAddress, decimals: String(n.decimals) }))
        : [{ ...EMPTY_NET }],
    );
  };
  const cancelEdit = () => { setEditId(null); setEditName(''); setEditNets([{ ...EMPTY_NET }]); };
  const saveEdit = async (id: string) => {
    setBusy(true); setError(null);
    try {
      const networks: CoinNetwork[] = editNets
        .filter((n) => n.code.trim() || n.contractAddress.trim())
        .map((n) => ({ code: n.code.trim().toUpperCase(), contractAddress: n.contractAddress.trim(), decimals: Number(n.decimals) }));
      await updateCoin(id, { name: editName.trim(), networks });
      cancelEdit(); await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const toggle = async (c: ManagedCoin) => {
    setBusy(true); setError(null);
    try { await updateCoin(c.id, { visible: !c.visible }); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const remove = async (c: ManagedCoin) => {
    setBusy(true); setError(null);
    try { await deleteCoin(c.id); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const field = 'p-2.5 rounded-xl bg-[#020d24]/60 border border-[#1E3559] text-sm text-[#d8e2ff] placeholder-[#8c90a0] focus:outline-none focus:border-amber-500/60 transition-colors';

  return (
    <div className="flex-1 min-h-full bg-[#06132a] text-[#d8e2ff] p-4 sm:p-6 lg:p-8 flex flex-col gap-6 overflow-y-auto">
      <header className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center pb-2 border-b border-[#1E3559]/40">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <Coins className="h-7 w-7 text-amber-400" /> {t('pageTitle')}
          </h1>
          <p className="text-xs sm:text-sm text-[#8c90a0] mt-1 font-mono">{t('pageSubtitle')}</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="self-start inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-sm font-bold cursor-pointer">
          <Plus className="h-4 w-4" /> {t('addCoin')}
        </button>
      </header>

      {error && <div className="px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm">{error}</div>}

      {/* Honest caveat about Nia support */}
      <div className="px-4 py-2.5 rounded-xl bg-[#112643]/60 border border-[#1E3559] text-xs text-[#8c90a0] leading-relaxed">
        {t('niaNote')}
      </div>

      {showForm && (
        <div className="p-6 rounded-2xl bg-[#112643]/70 border border-amber-500/20 flex flex-col gap-4">
          <h3 className="font-bold text-white text-sm">{t('addCoin')}</h3>
          <div className="flex items-center gap-4">
            {/* Logo upload (R2) */}
            <div className="shrink-0">
              {logoPreview ? (
                <img src={logoPreview} alt="logo" className="h-14 w-14 rounded-full object-contain bg-[#0a1b33] border border-[#1E3559]" />
              ) : (
                <div className="h-14 w-14 rounded-full bg-[#0a1b33] border border-dashed border-[#1E3559] flex items-center justify-center text-[#56607a]"><ImageIcon className="h-5 w-5" /></div>
              )}
            </div>
            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#1E3559] bg-[#020d24]/50 hover:bg-[#112643] text-[#afc6ff] hover:text-white text-xs font-bold cursor-pointer">
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} {t('uploadLogo')}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" className="hidden" onChange={(e) => onLogoPick(e.target.files?.[0])} disabled={uploading} />
            </label>
            <span className="text-[11px] font-mono text-[#56607a]">{t('logoHint')}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1"><span className="text-[11px] font-mono text-[#8c90a0]">{t('symbol')}</span><input className={field} value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="e.g. USDT" /></label>
            <label className="flex flex-col gap-1"><span className="text-[11px] font-mono text-[#8c90a0]">{t('name')}</span><input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tether" /></label>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-mono text-[#8c90a0] uppercase tracking-wider">{t('networks')}</span>
            {nets.map((n, i) => (
              <div key={i} className="grid grid-cols-[1fr_2fr_auto_auto] gap-2 items-center">
                <input className={field} value={n.code} onChange={(e) => setNets(nets.map((x, j) => j === i ? { ...x, code: e.target.value } : x))} placeholder={t('network')} />
                <input className={`${field} font-mono`} value={n.contractAddress} onChange={(e) => setNets(nets.map((x, j) => j === i ? { ...x, contractAddress: e.target.value } : x))} placeholder={t('contractPlaceholder')} />
                <input className={`${field} w-20`} value={n.decimals} onChange={(e) => setNets(nets.map((x, j) => j === i ? { ...x, decimals: e.target.value } : x))} placeholder={t('decimals')} title={t('decimals')} />
                <button onClick={() => setNets(nets.length > 1 ? nets.filter((_, j) => j !== i) : nets)} className="p-2 rounded-lg border border-[#1E3559] bg-[#020d24]/50 hover:bg-rose-500/15 text-[#8c90a0] hover:text-rose-400 cursor-pointer disabled:opacity-40" disabled={nets.length <= 1}><X className="h-4 w-4" /></button>
              </div>
            ))}
            <button onClick={() => setNets([...nets, { ...EMPTY_NET }])} className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#1E3559] bg-[#020d24]/40 hover:bg-[#112643] text-[#8c90a0] hover:text-white text-xs font-bold cursor-pointer"><Plus className="h-3.5 w-3.5" /> {t('addNetwork')}</button>
          </div>
          <p className="text-[11px] font-mono text-[#8c90a0]">{t('contractHint')}</p>

          <div className="flex gap-2">
            <button disabled={busy} onClick={create} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold cursor-pointer">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {t('add')}</button>
            <button disabled={busy} onClick={resetForm} className="px-4 py-2.5 rounded-xl bg-[#020d24]/60 hover:bg-[#112643] text-[#8c90a0] hover:text-white text-sm font-bold border border-[#1E3559]/80 cursor-pointer">{t('cancel')}</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs font-mono text-[#8c90a0] py-6">{t('loading')}</p>
      ) : coins.length === 0 ? (
        <div className="p-6 rounded-2xl bg-[#112643]/70 border border-[#1E3559] text-center text-sm text-[#8c90a0]">{t('noCoins')}</div>
      ) : (
        <div className="flex flex-col gap-3">
          {coins.map((c) => (
            <div key={c.id} className="p-4 sm:p-5 rounded-2xl bg-[#112643]/70 border border-[#1E3559] flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <CoinAvatar symbol={c.symbol} size={34} />
                  <div className="min-w-0">
                    <div className="font-bold text-white">{c.symbol} <span className="text-[11px] text-[#8c90a0] font-normal">· {c.name}</span></div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {c.networks.map((n) => (
                        <span key={n.code} className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-[#020d24]/60 border border-[#1E3559] text-[#afc6ff]" title={n.contractAddress}>
                          {n.code} · {n.contractAddress.slice(0, 6)}…{n.contractAddress.slice(-4)} · {n.decimals}d
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${c.visible ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' : 'bg-slate-500/10 text-slate-400 border-slate-500/25'}`}>{c.visible ? t('visible') : t('hidden')}</span>
                  <button disabled={busy} onClick={() => (editId === c.id ? cancelEdit() : startEdit(c))} title={t('edit')} className={`p-1.5 rounded-lg border cursor-pointer disabled:opacity-50 ${editId === c.id ? 'border-amber-500/40 bg-amber-500/15 text-amber-300' : 'border-[#1E3559] bg-[#020d24]/50 hover:bg-[#1e3459] text-[#8c90a0] hover:text-white'}`}><Pencil className="h-3.5 w-3.5" /></button>
                  <button disabled={busy} onClick={() => toggle(c)} title={c.visible ? t('hide') : t('show')} className="p-1.5 rounded-lg border border-[#1E3559] bg-[#020d24]/50 hover:bg-[#1e3459] text-[#8c90a0] hover:text-white cursor-pointer disabled:opacity-50">{c.visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button>
                  <button disabled={busy} onClick={() => remove(c)} title={t('delete')} className="p-1.5 rounded-lg border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/15 text-rose-400 cursor-pointer disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>

              {editId === c.id && (
                <div className="flex flex-col gap-3 pt-3 border-t border-[#1E3559]/60">
                  <label className="flex flex-col gap-1 max-w-xs"><span className="text-[11px] font-mono text-[#8c90a0]">{t('name')}</span><input className={field} value={editName} onChange={(e) => setEditName(e.target.value)} placeholder={t('name')} /></label>
                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-mono text-[#8c90a0] uppercase tracking-wider">{t('networks')}</span>
                    {editNets.map((n, i) => (
                      <div key={i} className="grid grid-cols-[1fr_2fr_auto_auto] gap-2 items-center">
                        <input className={field} value={n.code} onChange={(e) => setEditNets(editNets.map((x, j) => j === i ? { ...x, code: e.target.value } : x))} placeholder={t('network')} />
                        <input className={`${field} font-mono`} value={n.contractAddress} onChange={(e) => setEditNets(editNets.map((x, j) => j === i ? { ...x, contractAddress: e.target.value } : x))} placeholder={t('contractPlaceholder')} />
                        <input className={`${field} w-20`} value={n.decimals} onChange={(e) => setEditNets(editNets.map((x, j) => j === i ? { ...x, decimals: e.target.value } : x))} placeholder={t('decimals')} title={t('decimals')} />
                        <button onClick={() => setEditNets(editNets.length > 1 ? editNets.filter((_, j) => j !== i) : editNets)} className="p-2 rounded-lg border border-[#1E3559] bg-[#020d24]/50 hover:bg-rose-500/15 text-[#8c90a0] hover:text-rose-400 cursor-pointer disabled:opacity-40" disabled={editNets.length <= 1}><X className="h-4 w-4" /></button>
                      </div>
                    ))}
                    <button onClick={() => setEditNets([...editNets, { ...EMPTY_NET }])} className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#1E3559] bg-[#020d24]/40 hover:bg-[#112643] text-[#8c90a0] hover:text-white text-xs font-bold cursor-pointer"><Plus className="h-3.5 w-3.5" /> {t('addNetwork')}</button>
                  </div>
                  <p className="text-[11px] font-mono text-[#8c90a0]">{t('contractHint')}</p>
                  <div className="flex gap-2">
                    <button disabled={busy} onClick={() => saveEdit(c.id)} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold cursor-pointer">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {t('save')}</button>
                    <button disabled={busy} onClick={cancelEdit} className="px-4 py-2.5 rounded-xl bg-[#020d24]/60 hover:bg-[#112643] text-[#8c90a0] hover:text-white text-sm font-bold border border-[#1E3559]/80 cursor-pointer">{t('cancel')}</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
