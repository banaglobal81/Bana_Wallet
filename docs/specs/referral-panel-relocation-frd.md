# FRD — `ReferralPanel` relocation off `/staking` (RF-1 … RF-5 resolution)

> Status: **SPEC — ready to build.** Owner: `product-planner`. Date: 2026-08-09.
> Commissioned by: `docs/specs/oil-drilling-staking-game-realtime-decision.md` §1.3 (RT-1 / L1),
> constraints RF-1 … RF-5.
> Implementer: `web-wallet-expert`. Test owner: `qa-lead`. i18n copy review: `ui-ux-designer`.
>
> **This is a relocation, not a redesign.** `web/src/components/ReferralPanel.tsx` ships with a
> **zero-line diff**. Everything specified below is route, navigation and page chrome.
>
> **Blocking prerequisite for the Phaser canvas** (RT-1a): this change lands and is verified
> *before* any canvas work merges onto `/staking`.

---

## 1. Decision in one line

**`ReferralPanel` moves to a new dedicated authenticated route, `/<locale>/referral`, reachable from
the desktop sidebar and the profile menu — not from the mobile bottom nav, and not from any
money-path page.**

| Question | Answer |
|---|---|
| New route or addition to an existing page? | **New route.** `web/src/app/[locale]/(site)/referral/page.tsx` |
| Slug | **`referral`** (not `invite`) — matches `/api/referral`, `/api/referral/earnings`, `/admin/referral`, `lib/referral*`, `User.referralCode`. One codebase noun, no localized pathnames (`routing.ts` has none). |
| Nav entry needed? | **Yes — two of them.** Sidebar (desktop) **and** ProfileMenu (mobile + desktop). **Not** BottomNav. See §4. |
| Panel prop changes? | **None.** It is fully self-contained (§2). |
| Does the invite link change? | **No.** See §6. |

### 1.1 Why a dedicated route rather than a section on an existing page

RF-2 removes `/wallet`, `/deposit`, `/withdraw`, `/swap`, `/staking`. RF-5 rules out today's
`/compensation` and names a dedicated surface as the expected v1. Of what remains:

- **`/portfolio` (Dashboard)** — it is the landing page after login and the top of the funnel into
  the money path. Putting a recruitment panel there is the `/wallet` objection at one remove: it is
  the *first* thing every user sees, every session. Worse than today, not better.
- **`/activity`** — a chronological ledger of transactions. A live invite-link card is not an
  activity record; it would be the only non-chronological element on the page and would read as an
  insert.
- **`/settings`** — plausible, and it is where account-scoped things live. Rejected because it makes
  the referral program a *configuration* item rather than a feature, and because RF-1 requires
  discoverability not go to zero: burying it two clicks deep inside Settings is the accidental
  zeroing RF-1 forbids.

A dedicated route also makes the future RF-5 consolidation a one-line redirect (`/referral` →
`/compensation`) instead of an extraction.

---

## 2. What is being moved (verified, not assumed)

`ReferralPanel` is **fully self-contained**. Confirmed by reading
`web/src/components/ReferralPanel.tsx`:

- **Zero props.** `export default function ReferralPanel()`.
- **No staking data, no staking context, no shared state.** It does not read anything from
  `Staking.tsx` — it is rendered bare at `web/src/components/Staking.tsx:387` under a comment on
  line 386, with the import at line 10.
- **Its only external dependencies** are `getReferral` / `getReferralEarnings` from
  `@/utils/niaApi` and `copyToClipboard` from `@/utils/clipboard`. Both are route-agnostic.
- **It uses no `next-intl`.** Its copy is hardcoded English today (see §5.3).

**Consequence: the move is trivial.** No prop threading, no lifted state, no context provider, no
data refactor. The diff is an import removed from one file and a component mounted in another.

> **Finding for `qa-lead` — RT-1b's assertion as worded is vacuous and must be restated.**
> RT-1b says the `/staking` tree must import "nothing from `lib/referral*`". `lib/referral.ts` is
> **server-only** (`ensureReferralCode`, used by the route handler) and is *already* not imported by
> any client component, including `ReferralPanel` itself. That half of the assertion passes **today,
> before the move**, and would keep passing if the relocation were reverted.
> The client-side referral surface is `getReferral` / `getReferralEarnings` in
> **`@/utils/niaApi`** — a module `Staking.tsx` legitimately imports anyway (for `getNiaBalance`).
> The assertion must therefore be written as in AC-9/AC-10 (§8): no import of
> `@/components/ReferralPanel`, and no reference to those two named functions, anywhere in the
> `/staking` tree. Keep the `lib/referral*` clause as belt-and-braces; do not rely on it.

---

## 3. Screen — `/<locale>/referral`

### 3.1 Composition

```
(site) shell  ─ sidebar / top bar / bottom nav, unchanged
└── page container   .bana-page flex-1 min-h-full overflow-y-auto, p-4 sm:p-6 lg:p-8, gap-6
    ├── <header>     h1 = t('referral.pageTitle')     ← NEW page chrome
    │                p  = t('referral.subtitle')      ← NEW page chrome
    └── <ReferralPanel />                             ← VERBATIM, zero diff
```

Follow the container/header pattern already used by
`web/src/app/[locale]/(site)/compensation/page.tsx:31-40` (same classes, same header structure) so
the page is visually a peer of the other routes. `ActivityHistory.tsx:174-180` is the same pattern
expressed inside a component.

### 3.2 What page chrome is and is not permitted to be

RF-3 constrains **the panel**. The page around it needs a title for the same reasons every other
route has one (heading hierarchy, orientation, a non-empty failure state — §7.1). To keep that from
becoming a redesign by the back door:

| Permitted | Forbidden |
|---|---|
| One `<h1>` and one one-line factual `<p>` subtitle, both from `next-intl` | Any second panel, card, CTA, illustration, banner, tooltip, badge, share button or QR code |
| The existing page container classes | Any change to `ReferralPanel.tsx`, including "while we're here" i18n or styling |
| A `data-testid="referral-page"` on the container | Any new compliance/disclaimer copy — see §5.4 |
| Reordering nothing (the panel is the only child) | Any figure, count, rate or projection not already rendered by the panel |

The panel keeps its own `<h2>Invite &amp; Earn</h2>` (line 44-46) and its
`data-testid="referral-panel"` (line 43). Both are load-bearing: the testid is what RT-1b asserts the
*absence* of on `/staking` and the *presence* of here.

### 3.3 Inputs & validation

The page introduces **no inputs**. The panel's only interactive elements are unchanged:

| Element | Behaviour (existing, unchanged) |
|---|---|
| `data-testid="referral-link"` | `readOnly` text input, `onFocus` selects all. Not user-editable — nothing to validate. |
| `data-testid="referral-copy"` | Copy button. No-ops when `fullLink` is empty. |

There is no form, no submit, no mutation, and no write of any kind on this route. `/referral` is
**read-only**; the only network calls are `GET /api/referral` and `GET /api/referral/earnings`.

---

## 4. Navigation

### 4.1 The mobile finding that decides this

`web/src/app/[locale]/(site)/layout.tsx` renders the mobile top bar with **logo, LanguageSwitcher,
ThemeToggle, Notifications, ProfileMenu — and no hamburger button.** `mobileNavOpen` is only ever set
to `false` (lines 40, 46, 59). The `Sidebar`'s off-canvas drawer is therefore **unreachable on
mobile**; `BottomNav` replaced it (see the comment at `BottomNav.tsx:12-14`).

So a sidebar-only entry gives **zero mobile discoverability**, which is precisely the accidental
zeroing RF-1 forbids. A ProfileMenu entry is **required**, not optional.

### 4.2 The three nav surfaces

| Surface | Add? | Placement | Reasoning |
|---|---|---|---|
| **`Sidebar.tsx`** (desktop) | **Yes** | Between **Activity** and **Settings** | Keeps the money-path cluster (Wallet / Swap / Staking) contiguous and unbroken; referral sits in the secondary/account cluster. |
| **`ProfileMenu.tsx`** (mobile + desktop, non-admin branch only, `ProfileMenu.tsx:134-147`) | **Yes** | Between **Staking** and **Settings** | The only mobile route in. Also the semantically correct home: the panel is account-scoped ("*your* invite link", "*your* code"). Do **not** add it to the `isAdminArea` branch. |
| **`BottomNav.tsx`** (mobile primary) | **No** | — | The five bottom slots are the money path. Promoting a recruitment surface to peer status with Wallet/Swap/Staking on every mobile screen would *increase* referral prominence relative to today, where it is a section buried below the fold on one page. RF-1 permits discoverability to fall as a deliberate decision; **this is that decision, stated out loud.** The bar is `overflow-x-auto` so a sixth item is technically possible — that is not a reason to add one. |

### 4.3 Label and icon

- Label: `nav.invite` (§5.1). **"Invite", not "Referral"** — the nav label is chrome, so it is mine
  to choose, and the softer noun is the right one in KR/JP/CN. The URL stays `referral` for codebase
  consistency; users do not read the slug.
- Icon: **`UserPlus`** from `lucide-react`. The panel's own `Gift` icon stays inside the panel;
  a gift icon in a persistent nav rail reads as a reward promotion. `ui-ux-designer` may substitute
  a different neutral icon without re-spec; may not substitute a reward/prize/money icon.
- **No badge, no dot, no count** on the nav entry. A "3 invited" badge would be a new
  engagement affordance and is outside RF-3.

### 4.4 Entry points that must NOT exist

No link to `/referral` from `/staking`, `/wallet`, `/deposit`, `/withdraw`, `/swap`, or from the
staking success/completion flows. A `<Link href="/referral">` in `Staking.tsx` would technically
satisfy L1's import rule while re-creating exactly the adjacency L1 exists to prevent. It is
forbidden.

### 4.5 Wiring (this app routes through a `Screen` enum, not raw hrefs)

Both `Sidebar` and `ProfileMenu` navigate via `onNavigate(Screen)` → `useScreenNav` →
`SCREEN_TO_PATH`. Adding a route therefore requires **three** coordinated edits, or the nav entry
will silently no-op and the sidebar will highlight **Dashboard** while the user is on `/referral`
(`layout.tsx:22-35` falls back to `PORTFOLIO_DASHBOARD` when no path matches):

1. `web/src/types.ts` — add `| 'REFERRAL_INTERFACE'` to the `Screen` union.
2. `web/src/lib/useScreenNav.ts` — add `REFERRAL_INTERFACE: '/referral'` to `SCREEN_TO_PATH`.
3. The two nav components.

`PATH_TO_SCREEN` in the layout is derived from `SCREEN_TO_PATH`, so active-state highlighting then
works with no further change. The `navigateTo` direction matrix in `Sidebar.tsx:48-71` needs **no**
new branch — `direction` is accepted and ignored by `useScreenNav` (see its doc comment).

---

## 5. i18n — RF-4

### 5.1 New keys (three, in all six of `web/messages/{en,ko,ja,zh,vi,th}.json`)

`nav.invite` — appended to the existing `nav` namespace (line 7 block):

| Locale | Value |
|---|---|
| en | `Invite` |
| ko | `초대` |
| ja | `招待` |
| zh | `邀请` |
| vi | `Mời bạn bè` |
| th | `เชิญเพื่อน` |

`referral.pageTitle` / `referral.subtitle` — a **new top-level `referral` namespace**:

| Locale | `pageTitle` | `subtitle` |
|---|---|---|
| en | `Invite` | `Your invite link, referral code, and commission summary.` |
| ko | `초대` | `내 초대 링크, 추천 코드, 커미션 요약입니다.` |
| ja | `招待` | `招待リンク、紹介コード、コミッションの概要です。` |
| zh | `邀请` | `您的邀请链接、推荐码与佣金摘要。` |
| vi | `Mời bạn bè` | `Liên kết mời, mã giới thiệu và tóm tắt hoa hồng của bạn.` |
| th | `เชิญเพื่อน` | `ลิงก์เชิญ รหัสแนะนำ และสรุปค่าคอมมิชชันของคุณ` |

`ui-ux-designer` reviews tone; the **meaning is fixed** — it is a neutral, factual description of
what is on the page and nothing more.

### 5.2 Deny-list check on the new copy

Screened against the compensation-plan deny-list
(`docs/specs/compensation-plan-information-request.md` §3.3): no *investment*, *return*, *profit*,
*guaranteed*, *passive income*, *opportunity*, *downline*, *team*, *business*. "Commission summary"
is a factual description of the ledger figure the panel already renders ("Referral commission
earned", `ReferralPanel.tsx:80`) and introduces no new claim. **No projection, rate, or example
figure appears anywhere in the new copy.**

### 5.3 No orphaned or duplicated keys

- **Nothing is removed.** The panel uses no i18n keys today (hardcoded English), and `Staking.tsx`
  loses only a JSX line and an import — no `staking` namespace key becomes orphaned.
- **Nothing is duplicated.** `nav.invite` and the `referral` namespace do not exist today (verified
  against `web/messages/en.json`).
- **The panel stays English.** Localizing `ReferralPanel`'s internal strings is a change to the
  panel and is barred by RF-3. It is a real gap — logged as **RF-F2** (§9) — but it is a
  pre-existing gap that this change neither creates nor worsens, and folding it in would make the
  relocation diff unreviewable against RT-1b.

### 5.4 What this spec deliberately does not add

**No new disclosure or disclaimer copy.** A dedicated page makes the referral program more
conspicuous than a section buried on `/staking`, which is a fair reason to ask whether it needs the
kind of top-level disclosure `/compensation` carries
(`compensation/page.tsx:42-49`). I am **not** answering that here, and I am explicitly **not**
inventing the copy: referral-program compliance copy has never been reviewed, and unreviewed
disclaimer text written by a planner is worse than none. Logged as **RF-F3** (§9) for `pm`.

Note also that the `zh` ship/no-ship question (`compensation-plan-ui-plan.md` §4.1, §9) is **open and
untouched** — the panel already ships to `zh` today on `/staking`. This move changes the page, not
the locale set.

---

## 6. The invite link is unaffected — verified

`web/src/app/api/referral/route.ts:33-34` builds the link as
`${APP_URL}/signup?ref=${code}` (falling back to a relative `/signup?ref=${code}`, which
`ReferralPanel.tsx:26-28` absolutizes against `window.location.origin`).

**The link targets `/signup`, not the page hosting the panel.** Every already-shared invite link
therefore keeps working byte-identically. There is nothing to redirect, nothing to preserve, and no
deep-link migration.

- Referral **codes** are unchanged (`ensureReferralCode`, same DB column).
- `/signup?ref=…` handling in `web/src/app/[locale]/(auth)/signup/page.tsx` and
  `web/src/app/api/auth/register/route.ts` is untouched.
- **Do not** add a `/staking#referral` → `/referral` redirect or any legacy alias. The panel was a
  section with no anchor and no shareable URL; there is nothing for a user to have bookmarked.

---

## 7. Edge & error paths

### 7.1 `GET /api/referral` fails → the page has no card

`ReferralPanel.tsx:38` is `if (!info) return null;`. On `/staking` that was invisible among other
content. On a dedicated route it means **the page renders its header and subtitle and nothing
else**.

Realistically rare — `/api/referral` reads our own Postgres and `ensureReferralCode` creates a code
if one is missing, so `info` is null only on 401 / 5xx / network failure, not on "new user".

**Ruling: ship as-is for the relocation change.** The §3.2 page header is the mitigation — the user
sees a titled, oriented page with a missing card, not a white void. Fixing it properly requires
editing `ReferralPanel.tsx`, which RF-3 bars, and folding it into this diff would compromise the
audit RT-1b depends on. Logged as **RF-F1** (§9) with the exact fix and copy, to land immediately
after. **QA must cover this state explicitly (AC-13)** so it is a known, tested degradation rather
than a discovery.

### 7.2 `GET /api/referral/earnings` fails, or the program is inactive

Already handled inside the panel: the call is `.catch(() => null)` (line 19) and the commission card
is gated on `earn && (earn.enabled || earn.days > 0)` (line 77). The invite-link card still renders.
**Unchanged — do not "improve" this.**

### 7.3 Clipboard write fails (insecure origin, permission denied, older WebView)

`copyToClipboard` returns `false` → no "Copied" confirmation, no error shown. The `readOnly` input
with `onFocus → select()` (line 60) remains the manual fallback. **Existing behaviour, unchanged.**
Worth knowing this becomes more visible on a page whose entire purpose is copying a link — folded
into RF-F1's scope, not fixed here.

### 7.4 Logged out, or session expired mid-session

`/referral` sits inside `(site)`, and `auth.config.ts` is **default-deny** (`// All other protected
routes` → redirect to `/{locale}/login`). The new route is protected automatically with **no
matcher edit** — RF-1's "signed-in surface inside the authenticated shell" is satisfied structurally.

Known pre-existing behaviour, **not** in scope to fix: the redirect carries no `callbackUrl`, so a
logged-out deep link to `/referral` lands the user on the post-login default rather than back on
`/referral`. This is app-wide and predates this change.

### 7.5 Locale switch while on `/referral`

`routing.ts` defines **no localized pathnames**, so `/en/referral` ⇄ `/ko/referral` is a pure prefix
swap and `LanguageSwitcher` handles it with no new configuration. **AC-8 verifies it** rather than
assuming it.

### 7.6 Loading

The panel's own `Loading referral…` block (line 36) is the loading state. No skeleton, no spinner,
no page-level suspense boundary is added.

### 7.7 Admin users

An admin on `/referral` sees the ordinary user page — admins have referral codes like anyone else.
The ProfileMenu entry goes in the **non-admin branch only**, so an admin inside `/admin/*` is not
bounced out of the admin area (the existing rationale at `ProfileMenu.tsx:36-38`).

---

## 8. Acceptance criteria

**Relocation**

- **AC-1** — `/<locale>/referral` renders for all six locales, signed in, and contains exactly one
  element with `data-testid="referral-panel"`.
- **AC-2** — `web/src/components/ReferralPanel.tsx` has a **zero-line diff** in the relocation
  commit. Any change to that file fails review.
- **AC-3** — `Staking.tsx` no longer imports `ReferralPanel` (line 10 removed) and no longer renders
  it (lines 386-387 removed). No other change to `Staking.tsx` rides along in this commit.
- **AC-4** — The panel renders identically on `/referral` to how it rendered on `/staking`: same
  code, same invite link, same `directReferrals`, same commission card gating, same copy button
  behaviour.

**Navigation**

- **AC-5** — Desktop: a sidebar entry labelled `nav.invite` sits between Activity and Settings and
  routes to `/referral`.
- **AC-6** — Mobile: the entry is reachable from ProfileMenu (top-right avatar) in ≤2 taps. Verified
  on a 360×640 viewport. **`BottomNav` still has exactly five items.**
- **AC-7** — On `/referral` the sidebar highlights the Invite entry, **not** Dashboard (requires the
  `Screen` + `SCREEN_TO_PATH` edits of §4.5).
- **AC-8** — Switching locale on `/referral` stays on `/referral` under the new locale prefix.

**Structural guarantee (RT-1b — `qa-lead`)**

- **AC-9** — Test-asserted: the `/staking` page tree renders **no** element with
  `data-testid="referral-panel"`.
- **AC-10** — Test-asserted, static: no file in the `/staking` tree (`Staking.tsx` and its
  descendants) imports `@/components/ReferralPanel`, references `getReferral` or
  `getReferralEarnings`, or imports `lib/referral*`. Per §2, the third clause alone is insufficient.
- **AC-11** — `web/src/components/Staking.test.tsx` still passes. Note for the implementer: it mocks
  `@/utils/niaApi` with **only** `getNiaBalance` (lines 31-33), so the panel's fetch already throws
  into its own `catch` and it renders nothing under test today. **Removing it should break no
  existing assertion** — if it does, that assertion was depending on the panel and must be moved to
  the new page's test, not deleted.

**i18n**

- **AC-12** — `nav.invite`, `referral.pageTitle`, `referral.subtitle` exist in all six message files
  with no missing key, no `en` fallback leaking, no key added to only some locales, and no key
  orphaned by the removal from `Staking.tsx`.

**Degradation**

- **AC-13** — With `GET /api/referral` mocked to fail, `/referral` renders the localized `<h1>` and
  subtitle and does not crash, blank-screen, or throw. (Known limitation per §7.1 / RF-F1.)
- **AC-14** — With `GET /api/referral/earnings` mocked to fail, the invite-link card still renders
  and the commission card is absent.

**Boundary**

- **AC-15** — No link to `/referral` exists on `/staking`, `/wallet`, `/deposit`, `/withdraw` or
  `/swap` (§4.4).
- **AC-16** — This change adds **no** dependency, **no** API route, **no** schema change, **no**
  write, and **no** telemetry.

---

## 9. Follow-ups — named, not buried

None of these block the relocation. All three are things I deliberately did **not** fold in, because
RF-3 bars them and because RT-1a requires this diff to be small and auditable.

| ID | Item | Owner | Note |
|---|---|---|---|
| **RF-F1** | `ReferralPanel.tsx:38` `if (!info) return null` → render a short, localized error state with a retry, since on a dedicated page the null case is now a near-empty page (§7.1). Also surface a clipboard-failure hint (§7.3). | `pm` to grant a narrow RF-3 waiver; then `web-wallet-expert` | Ships **after** the relocation, as its own commit. |
| **RF-F2** | `ReferralPanel` is hardcoded English in all six locales (§5.3). | `ui-ux-designer` + `web-wallet-expert` | Pre-existing; unchanged by this move. |
| **RF-F3** | Does a dedicated referral page need a top-level disclosure of the kind `/compensation` carries? I did not answer this and did not invent copy (§5.4). | `pm` | Related open item: `compensation-plan-ui-plan.md` §9-C/§9-D. |

**Two notes for other agents, arising from this spec:**

- **`doc-keeper`** — standing rule 12 enumerates the routes that must ship **zero** game bytes and
  does not list `/referral`, which did not exist when it was written. It is covered by the rule's
  positive clause ("only on `/staking`"), but the enumeration should gain `/referral` so the list
  stays a complete statement of the rule. Also: cross-link this document from
  `oil-drilling-staking-game-realtime-decision.md` §1.3 and §7 — I have not edited that binding
  ruling myself.
- **`growth-pm`** — this is the placement change flagged in the ruling's non-blocking growth note.
  Concretely: the entry point moves from an always-rendered section on `/staking` to a dedicated
  route behind one desktop sidebar click or one mobile ProfileMenu tap, with **no** bottom-nav slot.
  Referral signup rate may fall. Per the ruling, that is **not** the game surface's metric and the
  two must not be joined.

---

*Resolves RF-1 … RF-5 of `docs/specs/oil-drilling-staking-game-realtime-decision.md` §1.3.
Blocking prerequisite for RT-1a. Related: `docs/specs/compensation-plan-ui-plan.md` §9-D (whether
the compensation plan eventually replaces this panel — still open, and the reason RF-5's
consolidation is "pre-approved in principle" rather than scheduled).*
