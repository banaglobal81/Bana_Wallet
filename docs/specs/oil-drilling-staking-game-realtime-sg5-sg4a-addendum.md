# ADDENDUM 3 — SG-5 (internal render resolution) and SG-4a (revert runbook)

> Status: **DONE, non-blocking-going-forward.** Owner: `web-wallet-expert`. Date: 2026-08-09.
> Addendum to `docs/specs/oil-drilling-staking-game-realtime-ship-gate-ruling.md` (Addendum 2),
> closing ship-checklist items **5 (SG-5)** and **6 (SG-4a)**. Changes nothing else in that
> document or in any other document in this family.

---

## 1. SG-5 — internal render resolution: reasoned no-change

**Finding: already compliant, and left unchanged.** `createGame.ts` boots a fixed 960×540
internal buffer with `Scale.FIT` for every breakpoint, including the 220px-tall mobile box.
Verified by reading `web/src/components/staking/field-live/scene/createGame.ts` as it ships
today:

```ts
const BASE_WIDTH = 960;
const BASE_HEIGHT = 540;

new Phaser.Game({
  type: Phaser.AUTO,
  width: BASE_WIDTH,
  height: BASE_HEIGHT,
  transparent: true,
  banner: false,
  fps: { target: 30, forceSetTimeOut: true },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [FieldScene],
});
```

No code touches `width`/`height` per breakpoint, and there is no `game.scale.resize()` call
anywhere in the tree (`grep`-confirmed empty). The CSS box that changes size per breakpoint is a
plain Tailwind class list on the *parent* div in `FieldCanvasBoundary.tsx`:

```
h-[220px] sm:h-[300px] lg:h-[380px]
```

— i.e. exactly the property SG-5 asked to confirm: the internal Phaser canvas resolution is fixed
and DPR-independent at every breakpoint; the CSS box is what changes size, via CSS, not by Phaser
re-rendering at a different internal resolution. `FieldScene.ts` lays out every element off
`this.scale.width`/`this.scale.height` (ratios, not literals), which is what makes `FIT` scaling
correct in the first place.

### 1.1 Whether a per-breakpoint (smaller-on-mobile) internal size is warranted

Evaluated and **declined**, for a reason stronger than "not worth the effort": **it would require
exactly the code standing rule 16 (Addendum 2 §1.4) forbids.**

Phaser's internal render-buffer resolution is a JS config value (`width`/`height` passed to `new
Phaser.Game(...)`) — there is no CSS-only mechanism for it. The only way to make it vary per
breakpoint is to read some runtime viewport/layout signal (`window.innerWidth`, a `matchMedia`
query, or the parent element's measured box) at boot time and branch the chosen resolution on it.
That is, by definition, a **device-class heuristic** — the exact category standing rule 16 names
and bans outright ("no device-class heuristic... whether or not it is reported anywhere.
Performance adaptation is either a build-time scope decision by `pm` or a user-controlled
preference (S8)"), with no carve-out for a one-shot boot-time check versus a continuously-adaptive
one.

A **uniform, static** resolution change (e.g. lowering 960×540 to something smaller for *all*
breakpoints, with no runtime branch) would not trip standing rule 16 — but it isn't well
motivated: it would degrade desktop/tablet quality that criterion 1-b was already measured against,
to fix a cost that is specifically a mobile/floor-device concern. That trade is a product call
about visual quality vs. headroom across every device, not a bounded engineering implementation
detail — it belongs to `pm` if ever wanted, not to this evaluation.

Supporting reasons this is comfortably a "no change needed" rather than a close call:

- **The DPR-independence property SG-5 asked to protect is already unconditional** at the current
  fixed 960×540 + `Scale.FIT` config, at every breakpoint, verified above — nothing here regresses
  it.
- **The scene's own budget is already small** (Addendum 2 §2.7: ≤24 animated elements, ~21 live
  particles in steady state, 30fps-capped render loop) — 960×540 is well under 1080p and is not,
  by itself, a large render target before any mobile-specific reduction is even considered.
- **The actual open question — does this scene run acceptably on a real floor device — is exactly
  what RD-1 (real-device verification, due 2026-09-08, default-to-remove) exists to answer.** If
  RD-1 fails, its own build-time pruning order (canvas height → D4 particles → D6 flag → D5 sky) is
  the escalation path, and a static, uniform internal-resolution drop is a cheap follow-up lever
  available to `pm` at that point — deciding it now, before real-device data exists, would be
  guessing at a number RD-1 is designed to inform.

### 1.2 Ruling compliance

No code changed. `Phaser.AUTO` stays the default renderer per Addendum 2 §2.6 (unchanged, not
addressed by this item). Reported values, as required by the ruling ("chosen values are reported
to `pm`"): **960×540 internal resolution, `Phaser.Scale.FIT`, `Phaser.Scale.CENTER_BOTH`, unchanged
at every breakpoint** — this *is* the chosen value, arrived at by declining the per-breakpoint
alternative for the standing-rule-16 reason above.

Since no code changed, `tsc --noEmit` and the test suite were not re-run for this item (nothing to
regress).

---

## 2. SG-4a — exact revert runbook

Written now, verified against the tree as it actually ships today (not reconstructed from memory
of earlier rounds — every path below was re-confirmed by reading the current files/imports/deps
immediately before writing this).

### 2.1 What "one clean revert" touches

**A. The game code tree (delete entirely):**

```
web/src/components/staking/field-live/
├── DepthBar.tsx
├── EventBus.ts
├── FieldCanvasBoundary.tsx
├── FieldCanvasBoundary.test.tsx
├── FieldLog.tsx
├── FieldMap.tsx
├── FirstRunSurvey.tsx
├── OilFieldEmbed.tsx
├── PhaserFieldMount.tsx
├── PhaserGame.tsx
├── RigSilhouette.tsx
├── ShiftReportOverlay.tsx
├── StaticFallback.tsx
├── StatusStrip.tsx
├── TankGauge.tsx
├── WellCompletionOverlay.tsx
├── WellDetail.tsx
├── WellPad.tsx
├── field-live.test.tsx
├── types.ts
├── useReducedMotion.ts
└── scene/
    ├── FieldScene.ts
    ├── createGame.ts
    └── palette.ts
```

**B. Two library files that live *outside* the tree above but are exclusively consumed by it**
(verified: `grep -rl "lib/oilfield" web/src` returns only files under `staking/field-live/`; zero
consumers anywhere else) — **delete these too**, or PH-4's "confined to one directory tree" claim
silently breaks on revert:

```
web/src/lib/oilfield.ts
web/src/lib/oilfield.test.ts
web/src/lib/oilfieldStorage.ts
web/src/lib/oilfieldStorage.test.ts
```

**C. The single mount point in `Staking.tsx`** (PH-4) — currently four things, all removable
together with no other call sites (verified: `scrollToPosition` and `scrollToProducts` are each
referenced exactly once, only as `OilFieldEmbed` props):

1. `import OilFieldEmbed from './staking/field-live/OilFieldEmbed';`
2. The `scrollToPosition` helper (I1 — scroll-sync from a rig click; exists solely to feed
   `OilFieldEmbed`'s `onSelectWell` prop).
3. The `scrollToProducts` helper (I3 — scroll-to-products from an empty pad click; exists solely
   to feed `OilFieldEmbed`'s `onScrollToProducts` prop).
4. The `<OilFieldEmbed ... />` JSX block and its preceding comment.

Not part of the revert (safe to leave, not a trap): the `id="staking-earn-section"` anchor and the
`id={`position-${p.id}`}` pattern on position rows both pre-date/are independent of the game (the
position-id pattern is reused from the pre-existing renewal-outcome "jump to successor" button; the
earn-section id becomes simply unreferenced, which is inert).

**D. The `phaser` dependency** — `web/package.json` line 51 (`"phaser": "3.90.0"`), removed via
`npm uninstall phaser` in `web/`, which also updates `package-lock.json` and `node_modules`.
Verified: every `import ... from 'phaser'` / `require('phaser')` in the codebase resolves to a file
inside `staking/field-live/` (5 files: `PhaserFieldMount.tsx`, `PhaserGame.tsx`, `EventBus.ts`,
`scene/createGame.ts`, `scene/FieldScene.ts`) — no other consumer exists, so the dependency is
removable outright once (A) is deleted.

**E. Test-suite coupling in `Staking.test.tsx`** — this is the one genuine partial-revert trap if
skipped, since it would leave a test that throws `ENOENT` reading a directory that no longer
exists:

- The mock line: `vi.mock('./staking/field-live/OilFieldEmbed', () => ({ default: () => null }));`
- The `it('AC-10 (descendants) — every file under staking/field-live/ is equally free of
  ReferralPanel...')` block, which `fs.readdirSync`-walks `staking/field-live/` — must be deleted,
  not just skipped, since (A) removes the directory it walks.
- **Leave alone:** the adjacent `AC-9` (`renders no element with data-testid="referral-panel"`) and
  the non-descendant `AC-10` (`the Staking.tsx source imports nothing from ReferralPanel...`) tests
  — both assert on `Staking.tsx` itself, are independent of the game tree, and remain valid
  (arguably more clearly correct, since there is even less surface to check) after the revert.

**F. i18n — the `oilfield` top-level namespace**, present in all six locale files, deleted as a
unit from each:

```
web/messages/en.json
web/messages/ko.json
web/messages/ja.json
web/messages/zh.json
web/messages/vi.json
web/messages/th.json
```

No other namespace references `oilfield` keys (self-contained, confirmed by the key list itself —
`title`, `statusStrip`, `shiftReport*`, `survey*`, `menuLog`, `motionPref*`, etc. — all scoped
under the one `"oilfield": { ... }` object). No migration, no cross-namespace key, nothing that
resists a clean object deletion.

### 2.2 What is explicitly **not** part of this revert

**The `/referral` route split and its nav wiring are a separable, independent change and should
NOT be reverted along with the game.** This is worth stating explicitly because pm's request named
it as something to check, and the honest answer is "no, leave it."

Why it's separable, not a partial-revert trap masquerading as one:

- `docs/specs/referral-panel-relocation-frd.md` states plainly: *"`ReferralPanel` ships with a
  zero-line diff. Everything specified below is route, navigation and page chrome."* It is a plain
  React/Next.js route relocation with **zero technical dependency on Phaser, `field-live/`, or
  `lib/oilfield*`** — verified: `ReferralPanel` is used only by
  `web/src/app/[locale]/(site)/referral/page.tsx`, which imports nothing from the game tree.
- It was a **blocking prerequisite that landed and was verified *before* any canvas work merged**
  (FRD header: *"this change lands and is verified before any canvas work merges onto
  `/staking`"*), specifically so RT-1 could hold (`/staking` never imports the referral surface).
  It solves a real, permanent problem (recruitment UI competing for attention with a live money
  page) that exists independent of whether the game ships.
- Reverting it would require re-adding `<ReferralPanel />` back onto `Staking.tsx` and undoing the
  nav entries in `Sidebar.tsx` / `ProfileMenu.tsx` (see §2.3) — none of which is needed to "restore
  `/staking` to its pre-realtime-game state" in any way that matters: `/staking` without the game
  and without the referral panel is a valid, already-shipped, already-tested state (it is
  literally what `/staking` looked like for the whole window between the relocation landing and the
  canvas merging).
- Un-reverting it would also require deleting `web/src/app/[locale]/(site)/referral/` and its i18n
  keys (`referral.pageTitle`, `referral.subtitle`), which is real, unrelated work with its own
  blast radius (route removal, nav removal, dead links) for no benefit tied to the incident this
  runbook exists for.

**Conclusion: the revert is (A)–(F) above only.** The `/referral` route, its two nav entries
(`Sidebar.tsx`, `ProfileMenu.tsx`, both scoped to the pre-existing `REFERRAL_INTERFACE` screen
constant already present in `types.ts` / `lib/useScreenNav.ts`), and its i18n keys stay exactly as
they are, with or without the game.

### 2.3 Confirmed: no other partial-revert trap

- **No migration.** The game reads/writes no new database tables — its only persistence is
  `localStorage` (`web/src/lib/oilfieldStorage.ts`, deleted in (B)) and reuses existing
  `StakePosition`/`StakingRewards` data already fetched by `Staking.tsx` for the real UI. Nothing in
  `prisma/` is touched by this feature.
- **No new API route.** The game reuses `getStakingRewardsSince` / `getStakingRewardsPage`
  (existing `stakingApi` helpers) and the existing `/api/platform` maintenance-mode check — `grep`
  across `web/src/app/api` for `oilfield` / `field-live` returns nothing. Deleting (A)+(B) leaves no
  orphaned server route.
- **No admin-side coupling.** `grep` across `web/src/app/[locale]/admin` for `oilfield` /
  `field-live` / `OilFieldEmbed` returns nothing.
- **The old static `/staking/field` route is already gone** (retired per decision doc §4 RT-7 stage
  2, prior to this game shipping) — there is no v1 fallback route to restore or reconcile; a revert
  simply leaves `/staking` as the real product/position UI with no field visualization at all,
  which is a valid, previously-shipped state.
- **PH-4's dependency containment holds** except for the two `lib/oilfield*` files noted in (B) —
  this addendum corrects that detail for the record: those two files are physically outside
  `staking/field-live/` (they live in `web/src/lib/`) but are exclusively consumed by it, so they
  must be included in the revert by hand; a revert that deletes only the `field-live/` directory
  and the `phaser` dependency would leave two dead, unreferenced files behind — harmless to a build
  (nothing imports them) but not a *clean* revert.

### 2.4 Post-revert verification

Confirms §2.3 criterion 6 (already passing per the ship checklist) rather than opening new work:
after applying (A)–(F), `npm run build`, `tsc --noEmit`, and the full test suite should all pass
with `/staking` rendering the real product list and position table with no field visualization and
no `phaser` bytes shipped anywhere in the client bundle — this is SG-4b, owned by `qa-lead`.

---

*Addendum 3 to `docs/specs/oil-drilling-staking-game-realtime-ship-gate-ruling.md` (Addendum 2),
closing ship-checklist items 5 and 6. Related: `docs/specs/oil-drilling-staking-game-realtime-decision.md`,
`docs/specs/oil-drilling-staking-game-realtime-frd.md`, `docs/specs/referral-panel-relocation-frd.md`.*
