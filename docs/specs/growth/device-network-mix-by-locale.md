# User Device & Network Mix by Locale — input to §9 item 5, Unity Evaluation

> Author: `growth-pm`. Date: 2026-08-05.
> Requested by: `docs/specs/unity-engine-evaluation.md` §9 item 5 — "our actual user
> device and network mix by locale... the single number that most changes the §4.3
> conclusion." This doc answers that question as far as real signal allows, and is
> explicit about where it does not.
> Scope note: this does **not** re-litigate the Unity decision. It only supplies the
> data input §4.3 asked for.

---

## 1. Headline answer

**We have no analytics pipeline that measures this today, and no locale field
persisted anywhere in the data model.** Everything below past §2 is **market-level
reasoning, not BANA telemetry** — labeled `[ESTIMATE]` throughout. Bottom line:

- **The vi/th skew-low/mid-end-Android-on-mobile-data claim holds up** under
  general market reasoning for Vietnam and Thailand. Nothing found here contradicts it.
- **The zh part of the claim is the weakest-grounded of the three** and is likely
  wrong as stated — see §3.3. `zh` traffic on a crypto-adjacent wallet is more plausibly
  Taiwan/Hong Kong/diaspora-weighted than mainland-China-grassroots-weighted, for a
  regulatory reason, not a device reason. That segment is not obviously low-end.
- **This does not change §4.3's conclusion.** The mandatory-fallback argument only
  needs *one* locale segment with a real low/mid-end mobile-data share to force a
  non-Unity fallback build — it does not need all three. vi and th alone are enough.
  See §4.

---

## 2. What actually exists in the codebase (real signal, but thin)

Searched for any analytics/telemetry/RUM integration and any stored locale or network
signal. Findings:

- **No analytics SDK anywhere** — no `gtag`, PostHog, Amplitude, Mixpanel, or
  equivalent in `web/`. No custom event pipeline.
- **No `locale` field on `User` or any other model** (`web/prisma/schema.prisma`).
  Locale is a `next-intl` URL path segment (en/ko/ja/zh/vi/th) at request time — it is
  never written to the DB, so there is no way to join "locale" to anything stored,
  today or retroactively.
- **`LoginSession` model does store per-login signal** that's *adjacent* to this
  question, but built for the "My Devices" / remote-logout security feature, not
  analytics:
  - `userAgent` (raw UA string) → parsed by `web/src/lib/session-device.ts`
    `parseUserAgent()` into a display string like `"Chrome 149 (macOS)"`. This gives
    OS + browser family, **not** a device-tier (low/mid/high-end) classification —
    that would require additional heuristics (UA model tokens, `deviceMemory`,
    screen size) that don't exist.
  - `ip` → resolved to `city`/`country` via `geoLookup()` (`web/src/lib/session-device.ts`,
    free `ipwho.is` lookup, 1.5s timeout, best-effort). **Country is a proxy for
    locale, not locale itself** — an `en`-locale session from a Vietnamese IP is
    plausible and would be miscounted either way you tried to bucket it.
  - **No network/connection signal at all.** Nothing captures
    `navigator.connection.effectiveType`, `navigator.deviceMemory`, or any RUM metric
    (LCP/TTFB) client-side. There is no way to know actual effective bandwidth for any
    session, real-time or aggregated.
- **No query tool available in this session either way.** This agent's toolset
  (`Read`/`Write`/`Grep`/`Glob`) has no DB access, so even the thin `userAgent` +
  `country` signal in `LoginSession` could not be aggregated live for this doc even if
  it were sufficient — which, per above, it isn't (no locale join key, no
  device-tier classification, no network data).

**Conclusion of §2: this question cannot be answered from BANA's own data today.**
Everything from here is external market reasoning applied to locales, not measurement
of BANA's actual users.

---

## 3. Market-level device/network reasoning by locale `[ESTIMATE]`

Applies general known smartphone-market conditions per country/region as of recent
years, mapped onto BANA's 6 locale codes. Where a locale code doesn't map cleanly to
one country, that ambiguity is called out — it materially affects the answer.

### 3.1 `ko` (Korea) — does NOT skew low-end `[ESTIMATE]`

- Android majority (roughly 65-75%, mostly Samsung Galaxy S/A-series with fast
  refresh cycles) with a large and growing iOS minority, concentrated in younger
  users — meaningful Safari share.
- Device tier: predominantly **mid-to-flagship**, not low-end. Korea has one of the
  highest device-replacement rates and highest per-capita spend on phones globally.
- Network: near-universal LTE/5G coverage, high effective bandwidth, wifi ubiquitous
  indoors. Among the strongest mobile-network environments in the world.
- **This locale was never part of pm's low-end claim, and nothing here contradicts
  that — ko is correctly excluded from the low-end bucket.**

### 3.2 `ja` (Japan) — does NOT skew low-end, but is Safari-heavy `[ESTIMATE]`

- iPhone share is unusually high for a major market (commonly cited well above 50%,
  among the highest in the world) — **iOS Safari is the dominant browser
  environment**, not just "a" browser.
- Remaining Android is mostly mid-to-high-end (Sony Xperia, Google Pixel, Sharp) —
  Japan does not have a meaningful low-end Android segment the way SEA markets do.
- Network: excellent, dense LTE/5G + wifi, high effective bandwidth.
- **Not a low-end-device case, but reinforces a different §3.3 point already in
  pm's doc**: iOS Safari being the *only* browser engine on iOS matters more here than
  device tier does — ja is a locale where the iOS-Safari-WebGL-constraint argument
  bites hardest, even though the device-tier argument doesn't apply.

### 3.3 `zh` — the weakest-grounded leg of the low-end claim `[ESTIMATE + judgment call]`

This is the one that most needs correcting, and it's a **market-composition**
question, not a **device-quality** question:

- **If `zh` traffic is mainland China grassroots users:** crypto services are
  restricted/blocked in mainland China (regulatory ban, GFW filtering). A
  crypto-adjacent B2B custody wallet realistically cannot be acquiring organic
  mainland-China retail traffic at scale without VPN friction — which itself selects
  for more technically capable, likely better-resourced users, not a random low-end
  cross-section.
- **More plausible composition for a `zh` locale on this product:** Taiwan, Hong
  Kong, and/or overseas Chinese-speaking diaspora (Chinese-speaking affiliate/referral
  networks in SEA are common for exactly this product category). Taiwan and Hong Kong
  are both **high-income, high-end-device, excellent-network markets** — closer to
  ko/ja than to vi/th. Diaspora traffic (e.g., Chinese-speaking users physically in
  Vietnam/Thailand/Malaysia) would trend toward *those* countries' device/network
  profile instead, which is a different reasoning chain than "China."
- **Net:** treating `zh` as low-end-skewed by default is not well supported. The
  correct default assumption, absent real data, is **unknown/mixed, plausibly
  skewing higher-end than vi/th** — not confirmed low-end. This is a genuine
  correction to §4.3's supporting claim.

### 3.4 `vi` (Vietnam) — assumption holds up `[ESTIMATE]`

- Android dominant (commonly cited in the 85-90%+ range), with a real and
  significant budget/mid-tier segment (Xiaomi, Oppo, Samsung A-series budget/mid
  models are common; historically Vsmart). This is a genuinely different device
  distribution from ko/ja/zh(TW/HK) — there is a real low/mid-end mass-market tier
  here, not just a theoretical one.
- Network: 4G is widely available and improving 5G rollout in major cities, but
  **effective bandwidth on the move (not marketed peak)** is meaningfully lower than
  KR/JP, and coverage/quality degrades outside urban centers. Wifi is common at
  home/work but a referral/affiliate wallet used casually is plausibly used
  mobile-data-first, consistent with pm's framing.
- **Assumption holds.**

### 3.5 `th` (Thailand) — assumption holds up `[ESTIMATE]`

- Android dominant (commonly cited 70-80%+), with a similar budget/mid-tier Android
  skew to Vietnam (Oppo, Vivo, Samsung A-series, Xiaomi common).
- Network: solid 4G in Bangkok and other urban centers with growing 5G, patchier and
  lower effective bandwidth outside them. Broadly comparable to Vietnam's profile.
- **Assumption holds.**

### 3.6 `en` — unaddressed by pm's doc, composition unknown `[open question]`

pm's doc doesn't claim `en` is low-end, but it also doesn't say what `en` traffic
actually is. For an affiliate/referral-heavy B2B wallet, "en" is plausibly not
US/UK/AU retail traffic but a catch-all for English-speaking affiliate networks that
could include genuinely low-end/low-bandwidth markets (e.g., Philippines, India, other
SEA/South-Asia English-language affiliate traffic) — which would *strengthen*, not
weaken, the low/mid-end-device argument if true. This is flagged as an open question
rather than a claim either way, since there's no data (real or market-level) to
resolve which `en` composition is closer to reality without knowing BANA's actual
affiliate network geography.

---

## 4. Does this change §4.3's conclusion?

**No.** Restating §4.3's actual logic: because Unity WebGL is unreliable on a
material share of the device mix, any responsible rollout must ship a non-Unity
fallback for users who can't run it — and since the fallback for a 2D-shaped feature
*is* the entire feature, the Unity build is net-additional cost.

That argument only requires **at least one** locale with a real, non-trivial
low/mid-end mobile-data share to force the mandatory-fallback conclusion. It does not
require *all* of vi/th/zh to qualify. Per §3, vi and th hold up under market-level
reasoning on their own — that's sufficient to sustain §4.3 regardless of how `zh`
gets corrected or how `en` resolves.

**The one way this actually flips §4.3** is if it turned out vi and th *also* don't
have a meaningful low/mid-end/mobile-data segment — i.e., every locale BANA serves is
effectively high-end-device/high-bandwidth. Nothing in market-level reasoning
supports that, and it would be a surprising finding if real data showed it.

**What should change in a future proposal (§8 item 4 of the Unity doc):** don't cite
"zh skews low-end" as supporting evidence without correcting it per §3.3 above. Cite
vi/th specifically, and treat `zh` and `en` as open questions requiring real data
before either is used as evidence in either direction.

---

## 5. Recommendation — close the actual data gap

If this question is going to keep mattering (it will, for other product decisions
beyond Unity — e.g. bundle-size budgets generally, image/video compression targets,
lazy-load thresholds), it's worth instrumenting cheaply rather than re-deriving
market estimates each time:

1. **Persist locale at signup/session time.** Add a `locale` field written once at
   account creation (from the `next-intl` path segment in the request) — cheap,
   durable, finally gives a real join key. Cross-area: schema change →
   `prisma-db-expert` + `pm` sign-off (out of `growth-pm` scope to implement).
2. **Client-side capability signal, not full analytics.** A minimal, privacy-light
   capture of `navigator.connection.effectiveType`/`saveData` and
   `navigator.deviceMemory` (where supported — Safari doesn't expose these, which is
   itself informative for the ja/iOS case) attached to session creation would turn
   §3 from market estimates into real distribution data within weeks of shipping.
   This is exactly the "device/network capability check" §4.4 item 4 of the Unity doc
   already requires for any future gated rollout — building it now pays for itself
   whether or not Unity ever returns.
3. Until either exists, **treat §3 as the best available answer, correctly labeled as
   estimate**, and do not let a future Unity proposal cite it as measured fact per
   §8 item 4 of the Unity doc ("must directly rebut §4.3" — an estimate can inform
   that rebuttal but a real proposal should get real numbers first).

Cross-area note: items 1-2 are implementation, not `growth-pm` scope — routing a
build ask requires `pm` product sign-off first (schema/telemetry addition), then
`product-planner`/web agents. Not filing that ask here; flagging it as the natural
follow-up if this data gap is worth closing.
