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
