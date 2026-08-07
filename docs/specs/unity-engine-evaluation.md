# Decision Doc — Unity Engine Activation Gate

> Status: **DECIDED — do not activate.** Author: `pm`. Date: 2026-08-05.
> **Updated 2026-08-05 (fact-verification pass)** — §9's unverified estimates have come
> back from `researcher` (`docs/research/2026-08-05-unity-webgl-activation-gate-facts.md`)
> and `growth-pm` (`docs/specs/growth/device-network-mix-by-locale.md`). §3.3, §4.2, §4.3,
> §5.2-§5.4, §8 and §9 are updated with sourced figures. **The decision is unchanged** —
> see §8.1 for why the one trigger that arguably fired does not move it.
> Scope: whether to activate `unity-expert` (dormant) and introduce a real Unity (C#)
> project + Unity WebGL build into the BANA monorepo.
> Re-evaluate when §8 triggers fire. This doc is written so a future proposal starts
> from §7/§8 rather than from zero.
>
> **Updated 2026-08-07 — the `unity-expert` agent stub has been retired** and
> `.claude/agents/unity-expert.md` no longer exists (team is now 17 agents).
> **The decision in §1 is unchanged**; removing a dormant stub that this doc had already
> ruled must not activate changes nothing about the analysis. Consequences for readers:
> - **This doc is now the sole record of the three activation gates.** They are restated
>   in full in §1's table; the file §1 cites as their source is gone.
> - Body text below still refers to `unity-expert` in the present tense (§5.3, §6, §7.2,
>   the §7.1 ladder). That is preserved deliberately as the historical record — read it as
>   "the agent that would be recreated", not as a live agent.
> - **A future proposal must recreate the agent file as step one**, carrying forward its
>   Forbidden list (no committed build artifacts) and Hub Call Rules (no `NIA_API_SECRET`
>   in the build, all data via `/api/nia/*`) — both cited as load-bearing in §5.3 — plus
>   the Gate 4 custody/audit requirement proposed in §6, which was never merged into the
>   agent file before removal.

---

## 1. Decision

**Do not activate `unity-expert`. Stay WebGL-only via `unity-fx-expert` for the
foreseeable future.**

All three activation gates in `.claude/agents/unity-expert.md` **fail today**:

| Gate | Criterion | Result |
|------|-----------|--------|
| 1 | A real game/mini-game feature in-app WebGL genuinely cannot deliver | **FAIL** — no such feature exists on the roadmap, and every gamification mechanic that fits this product is 2D/UI-shaped |
| 2 | Bundle-size and first-load cost tradeoff is acceptable | **FAIL** — cost is real and non-trivial, and there is no feature value to weigh it against |
| 3 | Railway build/deploy pipeline change is scoped and acceptable | **FAIL** — this is not a Railway change at all; it forks a one-service Nixpacks deploy into a two-pipeline system with a licensed proprietary toolchain |

Gate 1 is the binding failure. **Gates 2 and 3 are secondary** — if a genuinely
compelling feature existed, the cost in gates 2 and 3 would be payable. It does not,
so we are paying a large fixed cost for zero product value.

The 2026-08-05 fact pass moved several gate-2 and gate-3 numbers (some cheaper, most
more expensive — §4.2, §5.2, §5.4) and materially updated the mobile-support picture
(§3.3). **None of it touches gate 1**, which is the gate that decides this doc.

This is not a "no forever". It is a "no now, and here is exactly what a yes would
have to look like" (§8).

---

## 2. Context

- **What BANA is:** a B2B custody wallet — multi-market deposits/withdrawals, balance
  lookup, orders, trade history, settlement, plus a fixed-term staking product and a
  multi-layer referral bonus structure (`ReferralBonusPayout`: 대·소실적 매칭 / 유니레벨).
- **Who uses it:** affiliate/partner network users across 6 locales (en/ko/ja/zh/vi/th).
  The **vi/th** segments skew toward **mid- and low-end Android on mobile data**
  (`zh` was previously included in this claim and has been corrected out — see §4.3).
- **Surface:** mobile-first responsive web (`BottomNav`, `AdminBottomNav`). There is no
  native app — `mobile-expert` is dormant, no `mobile/` directory exists.
- **Product direction:** the wallet should *feel like a game* — flashy, alive,
  responsive. `unity-fx-expert` currently delivers this with dependency-free raw WebGL:
  `web/src/components/BanaBackground.tsx`, a full-viewport fragment-shader nebula
  mounted once at z-index -1.
- **The ask that produced this doc:** "what preparation is needed to use the Unity
  engine?" — asked green-field. **There is no game/mini-game feature request on the
  roadmap.**

That last point is the whole story. The question arrived as *"how do we use this
tool?"* rather than *"how do we build this feature?"*. Activating a game engine
because it is available, rather than because a feature demands it, is the exact
failure mode `unity-expert.md` was gated to prevent ("Do not activate this agent just
to make something look flashy — that is not a reason to pull in Unity").

---

## 3. Gate 1 — Is there a feature in-app WebGL cannot deliver?

### 3.1 What Unity actually buys us over raw WebGL

Unity is not "better graphics". Concretely, an engine earns its cost when you need:

1. A **3D scene graph** with hierarchy, culling, lighting, materials
2. A **physics simulation** (rigid bodies, collisions, constraints)
3. An **asset pipeline** — meshes, rigs, animation clips, texture compression, atlasing
4. **Gameplay authoring in C#** with an editor/scene workflow, so designers iterate
   without touching web code
5. **Cross-platform reuse** — the same project shipping to iOS/Android/console

Raw WebGL — what we ship today — gives us shaders, particles, glow, parallax,
procedural backgrounds, and feedback motion, at **zero dependency cost**. The gap
between the two is real, but it is only worth crossing if a feature lands squarely in
items 1-5.

### 3.2 Candidate feature inventory

I enumerated every gamification mechanic that plausibly fits a custody wallet with
staking + referral, and asked what each actually needs:

| Candidate | Fits BANA? | Needs Unity? | Correct tool |
|-----------|-----------|--------------|--------------|
| Reward spin-wheel / scratch card (staking or referral promo) | Yes | No | CSS + `motion`, already in deps |
| Streak / daily check-in, progress bars, tier badges | Yes | No | DOM + Tailwind |
| "Deposit confirmed" success burst, balance-tick flourish | Yes (shipping direction) | No | `unity-fx-expert`, existing |
| Referral network visualization (the MLM tree) | Yes — genuinely useful | No | 2D canvas / SVG; three.js only if 3D is proven better |
| Tap-to-earn / idle "mining" (Notcoin-style, popular in VN/TH) | Maybe | **No** | The category leaders are plain web/canvas. It is a counter with juice, not a game |
| 3D coin / NFT / badge viewer | Marginal | No | three.js (Tier 3), ~150-600 KB lazy-loaded |
| Plinko / crash / dice with real balances | **No** | (Matter.js would suffice anyway) | Blocked on regulation, not tech — see §3.4 |
| Avatar lobby / metaverse / multiplayer world | **No** | Yes | No product justification exists |

**Only the bottom row genuinely needs an engine, and it is the one row with no
product case at all.** Everything with a real product case is 2D and UI-shaped.

This is not a coincidence. Wallet gamification is about **feedback on financial
actions** — reward, progress, status, anticipation. Those are motion-design problems.
Unity's strengths (3D space, physics, asset-heavy interactive scenes) map to
essentially nothing a custody wallet does.

### 3.3 The mobile-browser disqualifier

*Updated 2026-08-05 from `researcher`. The original text here claimed Unity documents
mobile browsers as unsupported. **That is now out of date and is corrected below.***

**Official support has changed.** Unity 6 (`6000.x`, current LTS) is the **first LTS
line to officially support mobile browsers** for WebGL builds; prior LTS lines
(2021/2022) did not. The Unity 6 manual publishes a clean supported-version floor —
**iOS Safari 15+, Android Chrome 58+** — with no caveats on that page.

**Official support is not the same as viability on our device mix.** Three
Unity-adjacent sources disagree on how confidently "supported" should be read, and
`researcher` explicitly declined to silently resolve the conflict:

- Unity's **own launch messaging** scoped realistic mobile support to *"high-end mobile
  devices released in the last two or three years"*, with clearer minimum-hardware
  guidance still forthcoming at ship time.
- **Live bug reports through iOS 18.2-18.4 (2025)** on Unity's forums/issue tracker and
  Apple's developer forums show recurring WebGL context-loss and crash issues on iOS
  Safari. (Bug reports self-select for failure, so this is directional, not a base rate.)
- A commonly cited iOS Safari WebGL heap ceiling of ~300-500 MB is **third-party-blog
  sourced only** — no Apple or Unity primary source states a number. Treat as unconfirmed.

The practical constraints therefore stand essentially unchanged:

- Unity WebGL reserves a large wasm heap up front; mid-tier Android and iOS Safari
  reclaim tabs aggressively under memory pressure.
- WebGL context loss on tab backgrounding is routine on mobile — `BanaBackground.tsx`
  already handles `webglcontextlost` for exactly this reason, a pattern the 2025 bug
  reports validate as necessary rather than defensive-by-habit. A game engine losing
  context mid-session is a much worse failure than a background shader losing it.
- iOS Safari is the tightest environment and cannot be worked around; it is the only
  browser engine on iOS. Per `growth-pm`, this bites hardest in **`ja`**, which is
  iPhone-dominant even though it is not a low-end-device market.

BANA is mobile-first, and its fastest-growing locales are the ones with the weakest
devices. **A feature that supports only high-end devices from the last two-three years
is not a feature for this product.** Which forces the conclusion in §4.3.

> This change to Unity's official support status is, on paper, one of the §8
> re-evaluation triggers. See **§8.1** for the explicit ruling on whether it reopens
> the decision. (It does not.)

### 3.4 One category is blocked before the tech question

Wager-style mini-games (Plinko, crash, dice, lottery) staked with real balances are
the one category where "we need physics" would be a genuine technical argument. They
are nonetheless **out of scope on legal grounds, not technical ones**: attaching a
wager mechanic to a KYC'd custody wallet operating in KR/JP/VN/TH invites gambling
regulation, and would put banking/PSP and Nia-Hub relationships at risk.

Recording this explicitly so a future proposal does not treat "we need real physics"
as the hard part of that idea. It is not. Get a legal answer first; the engine
question is downstream and probably moot (Matter.js is ~40 KB).

### 3.5 Gate 1 verdict

**FAIL.** No feature exists that in-app WebGL cannot deliver. The one class of
feature that would require an engine has no product justification and, in its most
likely form, a regulatory blocker. **Unchanged by the 2026-08-05 fact pass** — nothing
`researcher` or `growth-pm` returned bears on whether a qualifying feature exists.

---

## 4. Gate 2 — Bundle size and first-load cost

This gate must be answered even though gate 1 fails, so a future proposal inherits a
budget instead of re-deriving one.

### 4.1 Our current position

The wallet is deliberately dependency-light: no three.js, no r3f, no game runtime.
`BanaBackground.tsx` is ~325 lines of raw WebGL with **zero** added bundle weight.
`motion` is the heaviest animation dependency and is used in only a handful of files.
This is a genuinely good position and is worth defending.

### 4.2 What Unity WebGL costs

*Updated 2026-08-05 with sourced figures. These are now **externally sourced**, not
`pm` placeholders — but they are still other people's builds, not ours. A POC
measurement is still required before a proposal cites a BANA number (§8 item 3).*

The single most important correction: **there is no one "build size" — there is an
optimization-effort curve**, and the three numbers below are different points on it.
A future proposal must state which point its POC represents.

| Point on the curve | Compressed (Brotli), total | Source quality |
|---|---|---|
| **Out-of-box empty scene**, no optimization (Unity 6, URP template / Built-in) | **~9.7-10.7 MB** | sourced, two independent reports |
| **Empty scene, aggressively optimized** — IL2CPP disk-size-optimized + LTO, stripping High, splash/default packages removed, Brotli | **~2.0-2.2 MB** | sourced, two independent numbers-first reports converging |
| Community "smallest realistic without extreme tooling" | ~5-7 MB | forum/blog aggregation |
| **Small shipped 2D game** — real data points: 7.8 MB (code-dominated) and 20 MB (audio-dominated) | **~8-20 MB** | individual dev reports, not a systematic sample |

Component detail, corrected:

- Loader JS ~10 KB; framework JS ~150-300 KB (unchanged, minor).
- **`.wasm` (IL2CPP): the doc's original ~3-6 MB was too pessimistic for a minimal
  scene** — the code component can reach **~1.5 MB compressed** with disk-size-optimized
  IL2CPP + LTO + aggressive package removal. It climbs back into the original range as
  soon as real gameplay code and engine subsystems (physics, UI, input) are referenced,
  which is the case for any actual feature.
- `.data` (assets) scales with content and, per the shipped-game data points, **audio is
  the swing factor, not the engine**.
- Brotli is confirmed materially better than gzip (~15-25%), but **requires HTTPS and a
  server that sends `Content-Encoding: br`** — which is exactly why the `/api/r2/[...key]`
  proxy is disqualified in §5.3.

Plus runtime cost the transfer size hides: **wasm compile/instantiate** (seconds on
mid Android) and a **large heap allocation** before first frame.

The load-time argument survives intact. Taking the realistic *shipped-game* band rather
than the empty-scene floor: at 8-20 MB over a real mobile connection (~2-4 Mbps
effective, not the marketed figure), that is roughly **15-60 seconds** before anything
is interactive, on the devices our growth locales use. The optimized ~2 MB floor is a
floor for an **empty scene** — it is not a number any shipped feature would hit.

### 4.3 The constraint that decides this gate

The gate's own wording — *"must not block the wallet's first paint"* — is satisfiable.
Isolate the game on its own route segment, dynamic-import the loader, keep the payload
out of every shared chunk, and gate the download behind a device/network capability
check. That part is solvable engineering.

The problem is what the capability check implies. Because Unity WebGL is unreliable
on — or officially scoped away from — a large share of our device mix (§3.3), any
responsible rollout **must ship a non-Unity fallback for the users who can't run it**.
And on this product, the fallback for a 2D-shaped reward mechanic is... the 2D web
version — which is the entire feature.

> **If you have to build the web version anyway, the Unity version is net-additional
> cost delivering the same feature to a smaller, richer, desktop-skewed slice of users.**

That is the strongest argument in this document and it is independent of bundle size.
Any future proposal must break this reasoning to pass.

**Locale evidence — corrected 2026-08-05 per `growth-pm`.** BANA has **no analytics SDK
and no persisted `locale` field** (next-intl locale is a URL segment only), so there is
no measured device/network mix. The supporting locale claims are market-level
`[ESTIMATE]`s, and one of them was wrong:

| Locale | Status after review |
|---|---|
| `vi`, `th` | **Assumption holds** — Android-dominant with a real budget/mid-tier mass-market segment and meaningfully lower effective mobile bandwidth than KR/JP. |
| `zh` | **Corrected — drop the low-end claim.** Mainland-China crypto access is regulatorily restricted, so realistic `zh` traffic is more plausibly Taiwan/HK/diaspora-weighted, which skews **high**-end, not low-end. Treat as unknown/mixed. |
| `ko`, `ja` | Correctly excluded already (high-end device, high-bandwidth). `ja` matters here for a *different* reason: iPhone-dominant, so the iOS-Safari constraint bites hardest. |
| `en` | **Unverified, composition unknown.** Plausibly affiliate-network traffic rather than US/UK/AU retail; if so it would *strengthen* the low-end argument, but there is no data either way. |

**This does not weaken §4.3.** The mandatory-fallback argument needs only **one** locale
with a real low/mid-end mobile-data segment to force a non-Unity fallback build. `vi`
and `th` sustain it on their own, independent of the `zh` correction and the `en`
unknown. The argument would only flip if `vi` and `th` *also* turned out to be
high-end/high-bandwidth, which nothing supports.

**Binding on future proposals:** do not cite "zh skews low-end" as supporting evidence.
Cite `vi`/`th` specifically, and treat `zh`/`en` as open questions requiring real data
before using them as evidence in either direction.

### 4.4 Budget a future proposal must meet

If Unity is ever proposed again, these are binding:

1. **Zero bytes on non-game routes.** No shared-chunk contribution. Wallet/admin
   first-load JS must be byte-identical before and after, verified by build output.
2. **LCP p75 on mobile for `/wallet` must not regress** — measured, not asserted.
3. **≤ 3 MB compressed** total first-time transfer on the game route. Above that,
   the proposal must quantify the engagement value that justifies the excess.
   *(2026-08-05 note: now known to sit just above the ~2.0-2.2 MB aggressively-optimized
   **empty-scene** floor and far below the 8-20 MB observed for real small shipped games.
   This is deliberate — it is a forcing function, and on current evidence a real Unity
   feature will not meet it without an explicit, quantified value argument.)*
4. **Explicit capability gate before download** — device/memory/network check, with a
   named, designed fallback experience for everyone who fails it. Note that this check
   is the same instrumentation `growth-pm` recommends building anyway (§9 item 5).
5. **All four `unity-fx-expert` FX rules still apply** to the embed: reduced-motion,
   cheap-device bail-out, context-loss handling, full unmount cleanup.
6. **Immutable, content-hashed asset URLs** so repeat visits cost 0 bytes.

### 4.5 Gate 2 verdict

**FAIL on current evidence** — not because the cost is unpayable, but because there is
no value on the other side of the ledger, and the mandatory fallback makes the Unity
build redundant with its own fallback.

---

## 5. Gate 3 — Railway build/deploy pipeline

### 5.1 Current pipeline

Single Railway service, `web/`, Nixpacks:

- `web/railway.json` — `builder: NIXPACKS`, start command
  `npm run db:deploy && (npm run db:seed:staking || …) && npm run start`
- `web/nixpacks.toml` — install phase overridden to `npm install --no-audit --no-fund`
- `web/next.config.mjs` — plain, `next-intl` plugin only
- No Dockerfile, no root `package.json`, no separate build service

It is a simple, fast, single-language pipeline. That simplicity is an asset.

### 5.2 Why Unity cannot be a Railway change

The gate is phrased as "the Railway build/deploy pipeline change needed". The honest
answer is that **there is no viable Railway-side change**:

- Nixpacks has no Unity Editor package, and the Unity Editor is not installable as a
  normal build dependency.
- CI-capable Unity images (`game-ci/unity-builder`) are **~7-7.5 GB compressed** for a
  Unity 6 + WebGL-module editor tag (e.g. `unityci/editor:ubuntu-6000.5.7f1-webgl-3.2.2`
  at ~7.38 GB) — *updated 2026-08-05; the original "multi-gigabyte" is now pinned down,
  with one unresolved discrepancy noted in §9.*
- A WebGL build takes **60-120 minutes clean, 30-50 minutes with `Library/` caching** —
  *updated 2026-08-05; the original "10-30 minutes" was optimistic by roughly 2-4x.*
- The build requires **license activation inside CI** with a Unity licence secret, plus
  seat management — and per §5.4, the officially sanctioned mechanism for this is a
  **separately purchased product**, not something a seat includes.
- Doing this inside the Railway build would couple every wallet deploy — including a
  one-line copy fix — to a **1-2 hour** licensed engine build. That is an unacceptable
  regression in deploy latency for a product where `deploy-manager` pushes routinely.
  The corrected durations make this worse than originally stated, not better.

### 5.3 The design that would actually be required

Two pipelines, decoupled:

```
Unity project  ──► GitHub Actions (unity-builder + licence secret)
   (unity/)         │  builds WebGL, 30-50 min cached / 60-120 min clean,
                    │  only on unity/** changes; ~7 GB editor image pull
                    ▼
             Cloudflare R2  ──► public CDN domain, content-hashed path
                    │
                    ▼
    Next.js loader component fetches at runtime, lazily, on the game route only
```

Notes specific to this repo:

- We already have R2 and `web/src/lib/r2.ts`, so the storage half exists.
- **Do not serve the build through `web/src/app/api/r2/[...key]/route.ts`.** Its
  `ALLOWED_PREFIXES` is `['coins/', 'brand/']`, and its `CT` map covers image
  extensions only — no `application/wasm`, no way to set `Content-Encoding: br`.
  More importantly, streaming multi-MB wasm through the Next.js server burns Railway
  egress and holds a Node stream per request. A **public R2 custom domain** is the
  right answer; that proxy is for small logos.
- Correct headers are load-bearing: `Content-Type: application/wasm` is required for
  streaming compilation, and Brotli-precompressed artifacts need matching
  `Content-Encoding` (confirmed 2026-08-05: Brotli also requires HTTPS, and buys
  ~15-25% over gzip — so this is not an optional nicety). Cross-origin loading needs
  CORS, and threaded builds would need COOP/COEP — which has knock-on effects on every
  embed on the page.
- `game-ci/unity-builder` is confirmed **actively maintained** (v5.0.0, recent release
  cadence, Node 24 migration, 25k+ teams claimed) — it remains the right CI path if this
  is ever built. Its licence-activation pattern has a compliance caveat: see §5.4.
- Build artifacts must never be committed (already in `unity-expert`'s Forbidden list).
- The build must never receive `NIA_API_SECRET` and must call `/api/nia/*` like any
  other client (already in `unity-expert`'s Hub Call Rules).

### 5.4 Ongoing cost

*Updated 2026-08-05 with sourced licensing figures. The original text deferred this to
§9; it is now priced, and it is **more expensive than assumed** because CI capacity is a
separate SKU.*

**Licensing — BANA cannot use the free tier.** Unity Personal's cap is **$200,000** in
trailing-12-month revenue **and** funding combined; a company over it "may not use Unity
Personal at all, even for internal projects or prototyping." A live custody platform is
almost certainly over this (formal confirmation against actual financials is still open —
§9). That puts BANA on **Unity Pro at $2,310/seat/year** (list, effective 2026-01-12) up
to $25M, Enterprise (quote-only) above.

**CI is a second, separate line item — this is the new finding.** Unity **Build Server**,
the officially sanctioned floating-license mechanism for headless/automated builds, is
contractually restricted to Pro/Enterprise **and is sold separately from an authoring
seat**, at the same ~$2,310/year for the Pro tier. It does not come with a Pro seat.

| Line item | Annual, list | Note |
|---|---|---|
| Unity Pro authoring seat (≥1, for whoever maintains the project) | **~$2,310** | mandatory above the $200K cap |
| Unity Build Server licence (sanctioned CI path) | **~$2,310** | separate product, Pro/Enterprise-only |
| **Minimum licensing floor for a sanctioned Unity CI pipeline** | **~$4,620/yr** | one seat + one build server |

The `game-ci` community alternative — activating a serial/`.ulf` inside the runner and
"returning" the licence after each build — avoids the Build Server line item, but it is a
workaround on a human seat's activation limit rather than the product Unity sells for
this purpose: fragile under concurrent CI runs and a **compliance gray area**. For a
regulated custody business, taking a licensing gray area to save $2,310/yr is a bad
trade, so **assume the ~$4,620/yr floor**, not the workaround.

Non-licensing permanent obligations, unchanged: a second CI pipeline, Unity version
upgrades, an R2 lifecycle/versioning policy for build artifacts, CI minutes and cache
storage for a ~7 GB image plus 30-120 minute builds, and a rollback story where the
wallet deploy and the game build can be at different versions simultaneously.

### 5.5 Gate 3 verdict

**FAIL as posed.** It is not a Railway pipeline change; it is a second build system.
The design above is sound and is the one to reuse if this is ever revisited — but it
is a permanent org-level cost, not a one-time setup — and the 2026-08-05 pass made that
cost **larger** (a ~$4,620/yr licensing floor and 30-120 minute builds), not smaller.

---

## 6. Additional finding — a fourth gate we should have

Not in the current trigger list, and for a custody wallet it may matter more than
gates 2 and 3:

> **Gate 4 (proposed) — custody and audit surface.**
> A Unity WebGL build is a multi-megabyte **opaque binary artifact** shipped into the
> same origin as a wallet that moves customer funds. It cannot be code-reviewed
> diff-by-diff the way `web/src/` is. `wallet-security-expert` would be asked to sign
> off on an artifact whose provenance is a proprietary toolchain and whose contents
> are compiled C#.
>
> A future proposal must specify: same-origin vs sandboxed-iframe isolation, whether
> the build can reach session cookies or `/api/*` at all, supply-chain policy for
> Unity packages and asset-store content, artifact integrity (SRI / signed manifest),
> and how `wallet-security-expert` is expected to review it.

`pm` cannot add this to `.claude/agents/unity-expert.md` — that file is the agent's
own under the Self-Update Protocol. **Recommendation:** route the addition to the
owner of that file.

---

## 7. Recommendation

### 7.1 Stay on the escalation ladder

"We want a game feel" must never jump straight to tier 4. The correct progression:

| Tier | Tool | Cost | Owner | Status |
|------|------|------|-------|--------|
| 0 | CSS transitions + `motion` | ~0 | `ui-ux-designer` / screen agents | in use |
| 1 | 2D canvas | 0 deps | `unity-fx-expert` | available |
| 2 | Raw WebGL / GLSL | 0 deps | `unity-fx-expert` | **in use** (`BanaBackground.tsx`) |
| 3 | three.js / PixiJS / Matter.js, lazy-loaded | ~40-600 KB | `unity-fx-expert`, **`pm` sign-off required** | **unspent** |
| 4 | Unity WebGL | 8-20 MB + 2nd pipeline + ~$4,620/yr licensing | `unity-expert` | **blocked — this doc** |

**Tier 3 is the real next step, and we have not spent it.** Almost anything described
as "we want an actual mini-game" is reachable at tier 3, inside one pipeline, one
language, one deploy, with a payload two orders of magnitude smaller. A proposal that
has not been tried and rejected at tier 3 cannot be evaluated at tier 4.

Note: this doc does **not** pre-approve tier 3. Adding a 3D/game dependency remains a
separate `pm` decision per `unity-fx-expert`'s Forbidden list.

### 7.2 Immediate actions

- `unity-expert` **stays DORMANT**. No sign-off issued. No `unity/` directory. No
  Unity tooling installed.
- `unity-fx-expert` continues to own game-feel FX at tiers 1-2, unchanged.
- **No code changes result from this doc.**

---

## 8. Re-evaluation trigger — what a future proposal must contain

Bring this back when **any** of these is true:

- A named feature is requested whose core loop needs a 3D scene graph, physics, or an
  asset pipeline — and a tier-3 prototype has been built and demonstrably falls short.
- BANA ships a native mobile app (`mobile-expert` reactivated), changing the
  cross-platform-reuse calculus in §3.1 item 5.
- Unity WebGL's mobile-browser support status materially changes (§3.3).
  **← fired on paper 2026-08-05; ruled non-reopening, see §8.1.**

### 8.1 Ruling — the mobile-support trigger fired, and it does not reopen the decision

Trigger 3 has technically fired. Unity 6's official mobile-browser support is a real,
material change from the "not supported" position §3.3 originally rested on, and the
doc has been corrected accordingly. Calling this explicitly rather than letting it sit
implicit in a fact update:

**The decision does not change.** Reasons, in order:

1. **Gate 1 is the binding failure and this trigger does not touch it.** Trigger 3 is a
   *feasibility* fact. Gate 1 is a *demand* fact — there is still no feature on the
   roadmap that needs an engine. Making an unwanted thing more buildable does not make
   it wanted. A trigger firing entitles a proposal to be *heard*; it does not
   pre-approve one, and §8's proposal checklist below is unchanged.
2. **The gate-2 argument survives the change anyway.** Official support is scoped by
   Unity's own messaging to "high-end mobile devices released in the last two or three
   years", with live iOS 18.x crash reports on top. That is precisely the population
   §4.3 says we must ship a fallback for — so the mandatory-fallback / "the fallback is
   the whole feature" argument is untouched. Support moved from *"doesn't work on
   mobile"* to *"works on the mobile devices that were never the problem"*.
3. **Everything else moved the wrong way.** The same fact pass raised build durations
   (10-30 min → 30-120 min), pinned the CI image at ~7 GB, and added a ~$2,310/yr Build
   Server line item that was not previously priced. Gates 2 and 3 got *more* expensive
   in the same pass that made gate 3's feasibility story better.

**Consequence for the trigger list:** trigger 3 is now considered **spent for the Unity 6
generation**. Re-firing it requires a *further* material change — e.g. Unity publishing
minimum-hardware guidance that actually covers mid-tier Android, or the iOS Safari
context-loss class of bug being closed out — not a re-citation of the Unity 6 support
announcement.

A proposal that reaches me must contain **all** of the following. Anything missing is
an automatic reject — this list exists so the groundwork in §3-§6 is not redone:

1. **The feature, named and specified** — core loop, screens, entry point, and the
   business outcome it drives (activation? retention? referral conversion? deposit
   volume?), with a target metric.
2. **The tier-3 rejection.** A real three.js/Pixi/Matter prototype, plus the specific
   capability it could not deliver. "It would be nicer in Unity" is not a rejection.
3. **Measured bundle numbers** from an actual POC build, against the §4.4 budget —
   **stating where on the §4.2 optimization curve the number sits.** An empty-scene
   figure quoted as if it were a shipped-feature figure is an automatic reject.
4. **The device-coverage answer** — what share of our real user device mix can run it,
   and the designed fallback for everyone else. Must directly rebut §4.3. **Must use
   real measured data, not the `[ESTIMATE]` locale reasoning in §4.3, and must not
   repeat the corrected "zh skews low-end" claim.**
5. **The pipeline plan** — reuse §5.3 or improve on it; name the licence tier, its
   cost, and who owns the second pipeline. **Must price the Build Server (or justify
   the `game-ci` activation workaround's compliance risk explicitly).**
6. **The Gate 4 security answer** (§6), pre-agreed with `wallet-security-expert`.
7. **A kill criterion** — the metric and date at which we would delete the Unity
   project. An engine with no exit condition is permanent by default.

---

## 9. Fact-verification status

Original items were routed to `researcher` and `growth-pm` on 2026-08-05. Results below.
Sources: `docs/research/2026-08-05-unity-webgl-activation-gate-facts.md`,
`docs/specs/growth/device-network-mix-by-locale.md`.

### 9.1 Resolved

| # | Question | Outcome | Folded into |
|---|---|---|---|
| 1 | Current Unity LTS mobile-browser support | **Changed** — Unity 6 is the first LTS to officially support mobile browsers (iOS Safari 15+, Android Chrome 58+), but Unity's own messaging scopes it to high-end devices from the last 2-3 years, and iOS 18.2-18.4 crash reports persist | §3.3, §8.1 |
| 2 | Realistic minimum WebGL build size | **Resolved as a curve, not a number** — ~9.7-10.7 MB unoptimized empty scene, ~2.0-2.2 MB aggressively optimized empty scene, ~8-20 MB for real small shipped games (audio-dominated) | §4.2, §4.4 |
| 3 | Unity licensing + CI activation mechanics | **Resolved, and worse than assumed** — Personal capped at $200K rev+funding; Pro $2,310/seat/yr (eff. 2026-01-12); **Build Server is a separate ~$2,310/yr product, Pro/Enterprise-only**; `game-ci` serial-activation workaround is a compliance gray area | §5.4 |
| 4 | `game-ci/unity-builder` status, image size, build duration | **Actively maintained** (v5.0.0). Image **~7-7.5 GB** compressed. Build **60-120 min clean / 30-50 min cached** — the doc's 10-30 min was optimistic | §5.2, §5.3 |
| 5 | BANA's actual device/network mix by locale | **Cannot be answered from BANA data** — no analytics SDK, no persisted `locale`. Market-level `[ESTIMATE]` only: vi/th hold, **zh corrected out**, ko/ja correctly excluded, en unknown. Does not change §4.3 | §2, §4.3 |

### 9.2 Still open — do not treat as settled

1. **Build Server pricing/terms are secondary-sourced.** Both
   `unity.com/legal/terms-of-service/build-server` and `unity.com/products/unity-build-server`
   returned **HTTP 403** on direct fetch; the ~$2,310/yr figure and the seat-bundling
   rules rest on search synthesis plus a third-party reseller listing. Re-verify via an
   authenticated channel or Unity sales before a proposal treats §5.4's table as final.
   The Unity 6 web-runtime blog post (§3.3) 403'd the same way.
2. **CI image size discrepancy unreconciled.** `game-ci/docker` issue #74 reports an
   editor image cut to ~1 GB, but currently published `unityci/editor` WebGL tags are
   ~7-7.5 GB. Unclear whether that work shipped, was reverted, or applies to a non-WebGL
   variant. §5.2 uses the ~7 GB published figure as the planning number.
3. **BANA's trailing-12-month revenue + funding is not formally confirmed** against the
   $200K Personal cap. Near-certain to exceed it as a live custody platform, but §5.4's
   "Pro is mandatory" conclusion should be confirmed from actual financials — an internal
   finance question, not a research one.
4. **No primary source for the iOS Safari WebGL heap ceiling.** The ~300-500 MB figure is
   third-party-blog only. Only controlled first-party testing (a POC) would settle it.
5. **No systematic benchmark for "trivial 2D game" WebGL size.** The 7.8 MB / 20 MB data
   points are two individual reports. A POC build (§8 item 3) is the only BANA-relevant
   number.
6. **`zh` and `en` locale composition remain unverified** and may not be used as evidence
   in either direction (§4.3).

### 9.3 Follow-up flagged, not filed

`growth-pm` recommends closing the underlying data gap — persist `locale` at signup, and
capture a minimal `navigator.connection` / `deviceMemory` capability signal at session
creation. This is **not** Unity-specific: it feeds bundle-size budgets, media compression
targets, and lazy-load thresholds generally, and it is the same instrumentation §4.4
item 4 would require anyway. It is a schema + telemetry change needing `pm` sign-off then
`prisma-db-expert` / web agents. **Deliberately not filed as part of this doc** — it is a
separate product decision, not a Unity decision, and this doc's §7.2 "no code changes"
stands.

---

## 10. Out of scope

- Tier-3 dependency approval (three.js / Pixi / Matter) — separate `pm` decision.
- Wager/gambling mechanics — legal question first (§3.4).
- Native mobile app strategy — `mobile-expert` is dormant.
- Any change to `.claude/agents/*.md` — each agent owns its own file.
- The locale/capability instrumentation ask (§9.3) — separate `pm` decision.
