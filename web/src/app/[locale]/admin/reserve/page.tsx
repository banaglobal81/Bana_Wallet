'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ShieldCheck, RefreshCw } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { getSolvency, runReserveVerificationNow, listControlledAddresses, type AdminSolvencyData, type PlatformControlledAddress } from '@/utils/adminApi';
import { SolvencyIncidentBanner } from '@/components/admin/reserve/SolvencyIncidentBanner';
import { AuthorityWarningBand } from '@/components/admin/reserve/AuthorityWarningBand';
import { ReserveVerificationPanel } from '@/components/admin/reserve/ReserveVerificationPanel';
import { ClaimsCompositionPanel } from '@/components/admin/reserve/ClaimsCompositionPanel';
import { LocalLedgerPanel } from '@/components/admin/reserve/LocalLedgerPanel';
import { IssuanceGatePanel } from '@/components/admin/reserve/IssuanceGatePanel';
import { AuthorityWatchPanel } from '@/components/admin/reserve/AuthorityWatchPanel';
import { ControlledAddressRegistry } from '@/components/admin/reserve/ControlledAddressRegistry';

// A-8 §4.1 /admin/reserve — panel order: incidents -> T1 band -> PoR verdict
// -> claims composition -> local ledger -> issuance gate -> authority watch
// -> controlled-address registry. No cross-coin totals are ever rendered
// (X-2/F-14) — every panel is rendered once PER coin, in its own block.
export default function AdminReservePage() {
  const t = useTranslations('adminReserve');
  const nav = useTranslations('nav');

  const [data, setData] = useState<AdminSolvencyData | null>(null);
  const [addresses, setAddresses] = useState<PlatformControlledAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningCoin, setRunningCoin] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [solvency, addr] = await Promise.all([getSolvency(), listControlledAddresses()]);
      setData(solvency);
      setAddresses(addr);
    } catch (e) {
      // E-1′ — a failed fetch is kept as a failure, never coerced into [] or null-as-empty.
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runNow = async (coin: string) => {
    setRunningCoin(coin);
    try {
      await runReserveVerificationNow(coin);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunningCoin(null);
    }
  };

  const localCoins = data?.coins.filter((c) => c.authority === 'LOCAL') ?? [];

  return (
    <div className="flex-1 min-h-full bg-[#06132a] text-[#d8e2ff] p-4 sm:p-6 lg:p-8 flex flex-col gap-6 overflow-y-auto">
      <Link
        href="/admin/dashboard"
        className="self-start flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#112643]/70 border border-[#1E3559] text-[#afc6ff] hover:text-white hover:bg-[#1e3459] text-sm font-bold transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> {nav('dashboard')}
      </Link>

      <header className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center pb-2 border-b border-[#1E3559]/40">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <ShieldCheck className="h-7 w-7 text-[#528dff]" /> {t('pageTitle')}
          </h1>
          <p className="text-xs sm:text-sm text-[#8c90a0] mt-1 font-mono">{t('pageSubtitle')}</p>
        </div>
        <button
          onClick={load}
          aria-label={t('refresh')}
          className="self-start p-2 rounded-lg border border-[#1E3559] bg-[#020d24]/60 hover:bg-[#1e3459] text-[#8c90a0] hover:text-white transition-colors cursor-pointer"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* Incidents render as soon as they arrive, independent of any section's own loading state (IN-8). */}
      {data && <SolvencyIncidentBanner incidents={data.incidents} />}
      {data && <AuthorityWarningBand warnings={data.warnings} />}

      {loading && !data ? (
        <div className="rounded-2xl bg-[#112643]/70 border border-[#1E3559] p-8 text-center text-sm text-[#8c90a0] font-mono">
          {t('loading')}
        </div>
      ) : error && !data ? (
        <div data-testid="section-unavailable-page" className="rounded-2xl bg-rose-500/10 border border-rose-500/25 p-5 text-sm text-rose-300">
          {t('por.state.unavailable.body')}
        </div>
      ) : data && data.coins.length === 0 ? (
        <div className="rounded-2xl bg-[#112643]/70 border border-[#1E3559] p-8 text-center text-sm text-[#8c90a0]">
          {t('noCoins')}
        </div>
      ) : data && localCoins.length === 0 ? (
        <div className="rounded-2xl bg-[#112643]/70 border border-[#1E3559] p-8 text-center text-sm text-[#8c90a0]">
          {t('noLocalCoins')}
        </div>
      ) : (
        data &&
        localCoins.map((c) => (
          <div key={c.coin} className="flex flex-col gap-4">
            <ReserveVerificationPanel coin={c.coin} section={c.reserve} onRunNow={() => runNow(c.coin)} running={runningCoin === c.coin} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ClaimsCompositionPanel coin={c.coin} section={c.liability} />
              <LocalLedgerPanel coin={c.coin} section={c.localLedger} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <IssuanceGatePanel coin={c.coin} section={c.issuanceGate} />
              <AuthorityWatchPanel coin={c.coin} section={c.authorityWatch} />
            </div>
          </div>
        ))
      )}

      {/* AU-1 reverse check (LL-9) — HUB-authority coins still show their authority chip here. */}
      {data && data.coins.filter((c) => c.authority === 'HUB').length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {data.coins
            .filter((c) => c.authority === 'HUB')
            .map((c) => (
              <AuthorityWatchPanel key={c.coin} coin={c.coin} section={c.authorityWatch} />
            ))}
        </div>
      )}

      <ControlledAddressRegistry addresses={addresses} onChanged={load} />
    </div>
  );
}
