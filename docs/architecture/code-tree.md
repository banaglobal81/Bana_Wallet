# Code Tree

> Referenced from `CLAUDE.md` → Docs Index. Read this when your task touches a
> directory you don't already own — not force-loaded into every agent's context.

```
web/src/app/[locale]/     — next-intl dynamic locale segment. Wraps the ENTIRE UI tree
                             (auth, site, admin) below — every user-facing route is
                             `/[locale]/...`, resolved by web/src/i18n/routing.ts.
web/src/app/[locale]/(auth)/  — public auth shell. login/, signup/, forgot-password/, reset-password/
web/src/app/[locale]/(site)/  — authenticated user shell. activity/, deposit/, portfolio/, settings/ (+settings/security/), staking/, swap/, wallet/, withdraw/
web/src/app/[locale]/admin/   — ADMIN-only area. coins/, dashboard/, settings/ (+settings/security/), settlement/, staking/, users/, withdrawals/
web/src/app/api/          — route handlers are NOT under [locale] (not user-facing pages)
web/src/app/api/nia/      — 13 Nia-Hub route handlers — see nia-integration.md for the full list
web/src/app/api/admin/    — settlement/{unsettled,history}/route.ts (ADMIN-only), plus coins/deposits-feed/referral/settings/staking/stats/users/withdrawals/upload
web/src/app/api/auth/     — register/route.ts (sign-up), [...nextauth]/route.ts (Auth.js login/session), 2fa/passkeys/sessions/email/change-password/forgot-password/reset-password/login-precheck/account
web/src/app/api/{coins,coin-logo,cron,platform,r2,referral,staking,user}/ — see each route.ts for details
web/src/auth.ts           — Auth.js v5 instance (handlers, auth, signIn, signOut)
web/src/auth.config.ts    — Auth.js config (providers, callbacks, pages)
web/src/middleware.ts     — route protection (redirects unauthenticated → /login, gates /admin) + locale negotiation
web/src/i18n/              — next-intl config: routing.ts (locale list/defaults), navigation.ts (typed Link/router), request.ts. Owned by `web-shared-expert` (shared infra, like auth/middleware).
web/messages/               — translation JSON, one file per locale: en, ko, ja, zh, vi, th. New UI text needs a key in every file — owning screen agent adds keys, `product-planner` owns the copy/tone.
web/src/lib/auth/session.ts — server-only guards: requireUser() (401), requireAdmin() (403)
web/src/lib/nia/          — server-only Nia-Hub API layer. config.ts, state.ts (globalThis singleton), client.ts (niaRequest/niaWalletRequest), resolve.ts, respond.ts, identity.ts (mints the `bana_<uuid>` id persisted to User.niaUserId at signup). All marked `import 'server-only'`.
web/src/components/       — React 19 components ('use client' where needed). Flat: Wallet, Dashboard, Deposit, Withdraw, Swap, Staking, ActivityHistory, Notifications, Settings, Sidebar, BottomNav, ProfileMenu, ReferralPanel, ThemeToggle, LanguageSwitcher, MaintenanceBanner, BanaLogo, BanaBackground (owned by `unity-fx-expert` — WebGL nebula background). Subdirs: admin/ (AdminSidebar, AdminBottomNav), security/ (SecurityCenter, TwoFactorSection, PasskeysSection, MyDevices, EmailVerification), staking/ (StakedSummaryCard), wallet/ (CoinAvatar, NetworkAvatar, FlowNav, Selects, Step).
web/src/app/globals.css   — the ONLY active stylesheet (imported by `web/src/app/[locale]/layout.tsx`): Tailwind v4 theme tokens, glassmorphic/bento effects, full light-theme override layer. (`web/src/index.css` was an orphaned pre-rebrand file — since removed; see `docs/patterns/ui-ux-designer.md`.)
web/src/types/            — next-auth.d.ts (session/role type augmentation)
web/src/utils/            — frontend client (niaApi.ts fetches /api/nia/*, relative URLs), clipboard.ts
web/prisma/               — schema.prisma (User + staking/referral/2FA/passkey/audit-log models), migrations/, seed.ts, seedStaking.ts
web/prisma.config.ts      — Prisma 7 config; datasource.url = env("DATABASE_URL")
web/server/core/nia-signing.js   — pure HMAC signing logic (reusable, harness-tested)
web/tests/harness/        — vitest harness tests (nia-signing/*)
web/package.json          — scripts: dev (next dev -p 3000), build, start, lint (tsc --noEmit), test (vitest run), db:migrate (prisma migrate dev), db:deploy (prisma migrate deploy), db:seed (tsx prisma/seed.ts), postinstall (prisma generate). All run from the `web/` directory — there is no root-level package.json.
```
