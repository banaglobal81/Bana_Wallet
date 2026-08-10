'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink, Plus, Loader2 } from 'lucide-react';
import type { PlatformControlledAddress } from '@/utils/adminApi';
import { addControlledAddress, deactivateControlledAddress } from '@/utils/adminApi';

// A-8 §6.4 RG-1~RG-8 — the ONLY screen that manages PoR-1″'s right-hand side.
// RG-5 (hard rule): there is no field anywhere in this component that lets an
// admin type in a reserve amount. The right side is always the on-chain
// balance of a registered address (computed server-side, elsewhere) — this
// form only ever registers/deactivates the address itself.
//
// Q-M3 (company wallet address) is unanswered as of this task — this screen
// is expected to render empty (RG-8), which is why PoR shows NO_RESERVE_BASIS
// ("UNCONFIGURED") rather than PASS today. That is the correct state, not a
// bug in this form.

function explorerUrl(network: string, address: string): string | null {
  const n = network.toUpperCase();
  if (n === 'BINANCE' || n === 'BSC') return `https://bscscan.com/address/${address}`;
  return null;
}

export function ControlledAddressRegistry({
  addresses,
  onChanged,
}: {
  addresses: PlatformControlledAddress[];
  onChanged: () => void;
}) {
  const t = useTranslations('adminReserve.registry');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ coin: 'BANA', network: 'BINANCE', address: '', label: 'COMPANY_TREASURY', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  const active = addresses.filter((a) => a.active);
  const inactive = addresses.filter((a) => !a.active);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await addControlledAddress(form);
      setForm({ coin: form.coin, network: form.network, address: '', label: '', notes: '' });
      setOpen(false);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async (id: string) => {
    setDeactivatingId(id);
    try {
      await deactivateControlledAddress(id);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeactivatingId(null);
    }
  };

  return (
    <section data-testid="controlled-address-registry" className="rounded-2xl bg-[#112643]/70 border border-[#1E3559] p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white font-mono">{t('title')}</h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-[#2E7DFF]/40 bg-[#2E7DFF]/10 text-[#2E7DFF] hover:bg-[#2E7DFF]/20 transition-colors cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" /> {t('add')}
        </button>
      </div>

      {active.length === 0 && <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5">{t('empty')}</p>}

      {error && <p className="text-xs text-rose-300">{error}</p>}

      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border border-[#1E3559] rounded-xl p-3.5">
          <label className="flex flex-col gap-1 text-xs text-[#8c90a0]">
            {t('field.coin')}
            <input
              value={form.coin}
              onChange={(e) => setForm({ ...form, coin: e.target.value.toUpperCase() })}
              className="px-3 py-2 rounded-lg bg-[#020d24] border border-[#1E3559] text-white text-sm font-mono"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[#8c90a0]">
            {t('field.network')}
            <input
              value={form.network}
              onChange={(e) => setForm({ ...form, network: e.target.value.toUpperCase() })}
              className="px-3 py-2 rounded-lg bg-[#020d24] border border-[#1E3559] text-white text-sm font-mono"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[#8c90a0] sm:col-span-2">
            {t('field.address')}
            <input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value.trim() })}
              placeholder="0x…"
              className="px-3 py-2 rounded-lg bg-[#020d24] border border-[#1E3559] text-white text-sm font-mono"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[#8c90a0]">
            {t('field.label')}
            <input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              className="px-3 py-2 rounded-lg bg-[#020d24] border border-[#1E3559] text-white text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[#8c90a0]">
            {t('field.notes')}
            <input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="px-3 py-2 rounded-lg bg-[#020d24] border border-[#1E3559] text-white text-sm"
            />
          </label>
          <p className="sm:col-span-2 text-[11px] text-amber-300">{t('addWarning')}</p>
          <button
            type="button"
            disabled={busy || !form.coin || !form.network || !form.address || !form.label}
            onClick={submit}
            className="sm:col-span-2 self-start inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} {t('add')}
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] font-mono uppercase tracking-wider text-[#8c90a0] border-b border-[#1E3559]">
              <th className="py-2 pr-3">{t('field.coin')}</th>
              <th className="py-2 pr-3">{t('field.network')}</th>
              <th className="py-2 pr-3">{t('field.address')}</th>
              <th className="py-2 pr-3">{t('field.label')}</th>
              <th className="py-2 pr-3">—</th>
            </tr>
          </thead>
          <tbody>
            {[...active, ...inactive].map((a) => {
              const url = explorerUrl(a.network, a.address);
              return (
                <tr key={a.id} data-testid={`registry-row-${a.address}`} className={`border-b border-[#1E3559]/40 ${a.active ? '' : 'opacity-50'}`}>
                  <td className="py-2 pr-3 font-mono text-white">{a.coin}</td>
                  <td className="py-2 pr-3 font-mono text-[#c3cee8]">{a.network}</td>
                  <td className="py-2 pr-3 font-mono text-[#afc6ff] break-all">
                    {a.address}
                    {url && (
                      <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 ml-2 text-[#2E7DFF] hover:text-white">
                        <ExternalLink className="h-3 w-3" /> {t('explorer')}
                      </a>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-[#c3cee8]">{a.label}</td>
                  <td className="py-2 pr-3">
                    {a.active ? (
                      <button
                        type="button"
                        disabled={deactivatingId === a.id}
                        onClick={() => deactivate(a.id)}
                        className="text-rose-400 hover:text-rose-300 font-bold disabled:opacity-50 cursor-pointer"
                      >
                        {t('deactivate')}
                      </button>
                    ) : (
                      <span className="text-[#8c90a0]">{t('deactivateNote')}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
