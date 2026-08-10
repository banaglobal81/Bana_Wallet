# Pattern Library — web-admin-expert

Read on demand by `web-admin-expert` only, when the current task's scope overlaps an entry below. See `CLAUDE.md` § Agent Self-Update Protocol for edit rules.

### Role-gated admin route (2026-06-17)
- Admin pages live at `web/src/app/[locale]/admin/<feature>/page.tsx` — under the `[locale]` segment like every other route, so locale-aware links/routing must go through `web/src/i18n/navigation.ts`, not plain `next/link`.
- Role guard: read `role` from `useApp()`. If `role !== 'broker'`, render an access-denied panel immediately (no data fetch). Data calls (`getNiaUnsettled`, `getNiaSettlementHistory`) only fire inside a `useEffect` guarded by `if (role === 'broker')`.
- Settlement amounts in history rows must go through `new Decimal(String(s.amount)).toFixed(8)` — never `Number()` / `parseFloat()`.

### Sidebar broker entry
- New non-Screen routes (e.g. `/admin/settlement`) use the locale-aware `Link` from `web/src/i18n/navigation.ts`; active highlight compares `usePathname()` (locale-stripped by that helper) against the route.
- The amber color token (`amber-500/10`, `amber-400`, `amber-500/20`) is used for all broker-mode UI to distinguish it from the indigo user-mode highlight.

### Role persistence (SSR-safe)
- `useState<Role>('user')` always — never read `localStorage` at render time.
- A `useEffect(() => { ... restore from localStorage ... }, [])` loads the persisted value after mount.
- `setRole` wrapper persists to `localStorage.setItem('bana_role', r)` on every change.
- Key: `'bana_role'`, values: `'user'` | `'broker'`.

### ProfileMenu broker toggle
- Toggle is a styled `<button>` pill (amber when broker, slate when user) above the menu items, separated by a `border-b`.
- Broker mode indicator: small amber `Building2` badge overlaid on the avatar button (`absolute -bottom-1 -right-1`).

### V2-CORE reserve dashboard (2026-08-10)
- When consuming already-implemented `web/src/lib/{localLedger,coinAuthority,withdrawalOnchain}.ts` + `web/src/lib/onchain/verifyWithdrawal.ts`, do NOT re-derive PoR/authority logic in a route — those files already export the exact decision functions (`runReserveVerification`, `evaluateReserveGate`, `assertExecutionAllowed`, `submitWithdrawalOnchainTx`). A `GET` dashboard route should only *read* (`ReserveVerificationRun.findFirst`, live counts) — never call `runReserveVerification()` from a GET handler, or "loading the dashboard" becomes a side effect that writes rows and pollutes verification history (DC-10 in the A-8 FRD).
- `ReserveVerificationResult` is a 5-value server enum (`PASS/FAIL/INCOMPLETE/QUERY_FAILED/NO_RESERVE_BASIS`); the FRD's "8 display states" (adds `NEVER_RUN`/`STALE`/`UNAVAILABLE`, and renames `NO_RESERVE_BASIS` to `UNCONFIGURED`) is a pure client-side derivation over `{sectionStatus, latestRun, isStale}` — keep that derivation in one framework-free `.ts` file (unit-testable without a DB) and never branch on the raw 5-value enum directly in a component.
- `next-intl`'s `useTranslations()` return type infers per-key overloads from the generated messages JSON. Calling `t(dynamicKey, values)` where `dynamicKey` is built at runtime (e.g. `` `${map[x]}.title` ``) breaks that inference — cast the hook result once to `(key: string, values?: Record<string, unknown>) => string` at the top of the component, not `as never` on every call site (the latter still fails when a `values` argument is present).
- When flattening a dotted-key i18n object (`'held.withdrawal': ...`) back into nested JSON, a plain sibling key at the parent path (`held: 'Held'`) collides — `unflatten()` throws trying to write a property onto a string. Rename the scalar label (`heldLabel`) before it collides with a group of `<label>.<child>` keys, rather than restructuring the whole namespace.
- `web/src/lib/onchain/*` and `web/src/lib/withdrawalOnchain.ts` are `web-shared-expert`-owned (per A-5 doc §2.2) but not under the `lib/nia/*` forbidden path — importing/calling their exported functions from an admin route is allowed; editing their internals (including the intentional `TODO` RPC stubs in `verifyWithdrawal.ts`) is not part of `web-admin-expert`'s task unless explicitly asked.
- `web/src/app/api/nia/withdrawals/route.ts`'s local-request history merge (`status: {in:['PENDING','PROCESSING','REJECTED','FAILED']}`, "APPROVED already shows from the hub") is HUB-rail-only logic that becomes wrong the moment any `AWAITING_ONCHAIN`/LOCAL-rail `APPROVED` row exists (A-5 §1.8) — but that file is under `api/nia/*`, forbidden for this agent to edit. Flag it as a required, same-release companion change for `web-shared-expert` rather than silently leaving the gap.
