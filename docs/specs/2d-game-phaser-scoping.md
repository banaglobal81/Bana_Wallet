# Scoping Note — 2D Game in BANA (Phaser?)

> Status: **OPEN — BLOCKED ON PRODUCT PURPOSE.** Not approved, not rejected.
> Owner: `pm`. Date: 2026-08-07.
> Decision needed from: the master (product purpose), then `web-wallet-expert` (feasibility).
> This is a scoping note, deliberately short. Phaser is a small commitment; it does not
> deserve a long evaluation until someone says what the game is for.

---

## 1. The question as asked, and the question that matters

**Asked:** "Is Phaser a good choice for a web 2D game attached to BANA?"

**Answer to that narrow question:** yes, probably — Phaser is the default, boring,
correct choice for 2D web gameplay in a TS app. One npm dependency, pure JS/TS, runs
inside the existing Next.js build, no separate engine export step or second toolchain.
If we build a 2D game, Phaser is a reasonable starting assumption.

**But that is not the decision.** Nobody has stated what the game is **for**. A wallet is
not a game console; a 2D game inside a B2B crypto wallet is not self-justifying. Picking
the framework before the purpose exists means we would be committing a dependency, a
route, a bundle budget, six locales of copy, and ongoing QA surface to a feature with no
stated goal.

So the verdict below is about the *feature*, not the *framework*.

## 2. Scope

**In scope:** actual gameplay — sprites, physics/collision, scenes, persistent game state.

**Out of scope:** decorative background FX. That is already solved and is a separate
concern — `web/src/components/BanaBackground.tsx` is hand-written raw WebGL, owned
informally by `web-wallet-expert` since `unity-fx-expert` was retired (2026-08-07).
Nothing here proposes replacing it, and Phaser is *not* a reason to touch it.

## 3. Precedent

A full Unity (C#) engine was previously evaluated for this project. The decision was
**do not activate — stay WebGL-only**, re-evaluate only on specific triggers (device/network
mix, bundle budget). The principle established was: **no heavy game/3D dependency without
product sign-off.**

Those documents (`docs/specs/unity-engine-evaluation.md` and its supporting research) were
deleted on 2026-08-07 at the master's request as part of an unrelated cleanup. The docs are
gone; the principle is not. This note exists partly so the precedent survives its paper
trail.

**Phaser is a much lighter ask than Unity** — order of magnitude ~1 MB minified as a single
npm package versus a whole engine export pipeline, no C#, no separate build. It should not
be judged by the Unity bar. But it is the same *kind* of call, so it gets the same gate,
set lower.

## 4. Open questions — Q1 blocks everything

### Q1 (BLOCKING) — What is the game for?

Pick one, or name a different one. Each implies a completely different feature, risk
profile, and success metric:

| Candidate purpose | What it would actually be | Metric it must move |
|---|---|---|
| **Gamified rewards** | Play → earn BANA / points | Retention, DAU |
| **Loyalty / quest system** | Task completion with game-like progression | Activation, feature adoption |
| **Onboarding** | Interactive tutorial for deposit/withdraw/swap | First-deposit conversion, support tickets |
| **Brand / marketing** | A standalone playable, possibly outside the wallet | Acquisition, referral shares |
| **"It would be cool"** | — | — (valid answer; changes the budget conversation, not the project) |

Everything downstream — bundle budget, route placement, whether it ships to all six
locales, whether legal has to look at it — is determined by this answer. **I am not going
to invent one.**

### Q2 — Does game outcome touch money?

Does anything a user does in the game change a balance, a reward, a rank, or token
emission? See §5; this is the single biggest risk fork in the whole question, and it is
answerable in one word.

### Q3 — Where does it live, and who sees it?

A route under `(site)` alongside `/wallet` and `/staking`, or a separate surface? All
users, or gated? A game route in the authenticated wallet shell is a different product
than a game on a marketing page.

### Q4 — Who builds and maintains the content?

Phaser gives us a framework, not a game. Art, levels, balance, and ongoing content are the
actual cost, and this team has no game-content capacity today. A framework decision that
quietly assumes a content pipeline is not a decision.

## 5. Risk flag — read this before answering Q2

BANA is not a neutral place to attach a reward game. This app ships a **compensation plan**
(`/compensation`, packages, binary tree, rank pool) and a **live referral program**
(`ReferralPanel.tsx`, `lib/referral*`) across **en/ko/ja/zh/vi/th**. That plan already
carries a prohibited-language deny-list (*investment, return, ROI, passive income,
guaranteed, profit, yield*) and known jurisdictional exposure — KR 방문판매법, JP
連鎖販売取引, US FTC/*Howey*, VN/TH restrictions, and CN prohibits MLM outright.

Bolting a **chance-based mechanic that pays out tokens** onto that structure is how a
compliance question becomes a gambling/lottery question in several of those markets at
once. It is also exactly the sort of thing that reads badly in a regulator's screenshot.

**Therefore, as a standing product constraint:**

- A game whose outcome is **cosmetic/informational only** (score, progress, badge, no
  economic value) is a normal product decision, decidable by us.
- A game whose outcome **credits BANA, points redeemable for value, rank progress, or
  emission** is **not** a UI feature. It requires a server-authoritative ledger, anti-abuse
  design, and a legal review per market before a single line is written. It does not get
  approved in a framework-selection conversation.

## 6. Recommendation

**Do not add Phaser yet. Do not reject it either.**

1. **Hold the dependency.** No `package.json` change, no prototype in `web/src/`, until Q1
   is answered.
2. **Answer Q1 and Q2.** One or two sentences from the master is enough to unblock.
3. **If cosmetic and the use case is real** (most likely onboarding or a light loyalty
   surface): proceed to feasibility, with these budget conditions stated up front —
   - **Route-scoped `dynamic()` import only.** Phaser must never enter the shared bundle or
     the critical money path (`/wallet`, `/deposit`, `/withdraw`, `/swap`). A user who never
     opens the game must not download a byte of it.
   - **SSR-off**, since Phaser is canvas/DOM-bound and this app is Next 15 App Router.
   - **Perf floor on low-end mobile.** The evidence base for our device/network mix
     (`docs/specs/growth/device-network-mix-by-locale.md`) was deleted today; if this becomes
     a real project that data must be **re-gathered by `researcher`**, not recalled from
     memory.
   - **i18n from day one** — six locales, or an explicit decision to ship the game in fewer.
4. **If it touches money:** stop, and route it through the §5 constraint first.

**My honest read:** a 2D game is *plausible* for onboarding and *weakly* justified for
everything else. Retention games in finance apps mostly under-deliver relative to their
maintenance cost, and the reward-linked version carries risk that is disproportionate for
this specific product. I would want the payoff hypothesis stated as a number before
spending engineering time — but I will not pre-judge a use case I have not heard yet.

## 7. Division of labor (when unblocked)

| Step | Owner | Trigger |
|---|---|---|
| Product purpose + metric | master → `pm` | now — blocking |
| Engagement payoff sizing | `growth-pm` | after Q1 |
| **Phaser vs alternatives, bundle/SSR/perf feasibility** | **`web-wallet-expert`** | after Q1 — I set direction, they confirm feasibility |
| Screens, flows, error/empty states (game surface) | `game-planner` | after feasibility confirms |
| Device/network mix re-research | `researcher` | only if perf becomes the deciding factor |

`pm` does not pick the framework. That call is `web-wallet-expert`'s, and this note should
not be read as pre-approving Phaser — only as saying it is not the problem.

*Update 2026-08-07:* the `game-planner` agent was created after this note was first written
(row above updated accordingly). It owns game-surface FRDs/flows; `product-planner` keeps
everything else.

---

*Supersedes nothing. Related: the deleted `unity-engine-evaluation.md` precedent (§3).*
