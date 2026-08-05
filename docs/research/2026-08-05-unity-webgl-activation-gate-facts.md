# Unity WebGL Activation Gate — Facts Verification (doc §9, items 1–4)

> Scope note: this covers items 1–4 of `docs/specs/unity-engine-evaluation.md` §9. Item 5
> (BANA's actual device/network mix by locale) is out of scope for `researcher` — that doc
> routes it to `growth-pm` since it requires internal analytics, not external sourcing.

## Summary

Unity 6 (the current LTS line, `6000.x`) **newly ships official mobile-browser WebGL
support** as of its Oct 2024 release — a real change from prior LTS versions, which did not
support mobile browsers at all. But Unity's own announcement scopes that support to
"high-end mobile devices released in the last two or three years," and independent bug
reports through 2025 show recurring WebGL context-loss crashes on iOS Safari (including on
iOS 18.2–18.4) and a practical heap ceiling well below desktop — so "officially supported"
and "reliable on BANA's actual device mix" are two different claims, and the gap matters for
a product whose fastest-growing locales skew mid/low-tier Android. On build size, the doc's
placeholder (~4-8 MB empty-scene floor, ~10-25 MB small shipped game) is in the right order
of magnitude but the true achievable floor with aggressive optimization is lower (~2 MB
compressed, Unity 6, Brotli) than the doc assumed, while default/unoptimized starting points
run higher (~9-11 MB before any stripping). On licensing, Unity Personal (free, revenue/
funding cap raised to $200,000) explicitly **cannot** be used for CI at all — Unity's own
Build Server terms restrict it to Pro/Enterprise — and CI capacity is a distinct paid product
(~$2,310/seat/year for Pro, same again for a Build Server license) on top of at least one
authoring seat. On tooling, `game-ci/unity-builder` is actively maintained (v5.0.0, recent
release history, 25k+ teams cited), but published Docker images for Unity 6 + WebGL module
run ~7-7.5 GB compressed — larger than the doc's vague "multi-gigabyte" — and real-world
clean-build durations reported by a working pipeline (60-120 min clean, 30-50 min cached) run
longer than the doc's 10-30 minute placeholder.

## Findings

### 1. Mobile-browser WebGL support

- **Unity 6 is the first LTS line to officially support mobile browsers for WebGL builds; prior LTS (2021/2022) did not.** Mobile (Android/iOS) browser support was announced as landing in Unity 6, built on Safari's WebGL2 support and cooperation with the Chrome team. Confidence: high. [Unity blog — Web runtime updates](https://unity.com/blog/engine-platform/web-runtime-updates-enhance-browser-experience) (fetch blocked, HTTP 403; content triangulated via search-result summary and secondary coverage below)
- **The current Unity 6 manual lists a specific supported mobile browser-version floor: iOS Safari 15+ and Android Chrome 58+**, with a general "use the latest browser version" caveat and no stated memory-limit numbers on that page. Confidence: high (primary source, directly fetched). [Unity 6 Manual — Web browser compatibility](https://docs.unity3d.com/6000.4/Documentation/Manual/webgl-browsercompatibility.html)
- **Unity's own launch framing scoped realistic mobile support to "high-end mobile devices released in the last two or three years,"** with the company stating clearer minimum-hardware guidance was still forthcoming at ship time. This directly undercuts applicability to BANA's vi/th/zh segments, which the activation-gate doc (§2) already characterizes as mid/low-tier Android. Confidence: medium (from search-result synthesis of Unity's Unite/Unity 6 preview announcement, not independently re-fetched from a primary page). [Unity 6 Preview announcement coverage](https://unity.com/blog/engine-platform/unity-6-preview-release)
- **The WebGPU graphics backend for Web is explicitly experimental and Unity does not recommend it for production** as of the Unity 6 announcement. This is separate from the default WebGL2 backend, which is the one actually relevant to a near-term Unity WebGL build. Confidence: medium.
- **Real-world reports through 2024-2025 show recurring WebGL context-loss and crash issues on iOS Safari**, including a wave of reports specific to iOS 18.2/18.3/18.4 on iPad 8th/9th-gen and other devices, filed both on Unity's own discussion forums/issue tracker and Apple's developer forums. Confidence: high that these reports exist and are recent; confidence medium on how representative they are of the median device (self-selected bug reports skew toward failure cases). [Unity Discussions — WebGL context lost iOS 17 Safari](https://discussions.unity.com/t/webgl-context-lost-ios-17-safari/930432) · [Unity Issue Tracker — memory usage increased on Safari](https://issuetracker.unity3d.com/issues/memory-usage-increased-in-newer-versions-when-using-safari) · [Apple Developer Forums — WebGL crashing iOS 18.2/18.3](https://developer.apple.com/forums/thread/778735)
- **A commonly cited practical iOS Safari WebGL heap ceiling is roughly 300-500 MB**, well below desktop browsers, with guidance to keep footprint under ~384 MB and gate audio behind user interaction (iOS blocks audio autoplay pre-interaction, and unhandled failures there can cascade into crashes). Confidence: low-medium — this figure comes from a third-party aggregator blog (bugnet.io), not from an Apple or Unity primary source; no official Apple/Unity page with a stated numeric WebGL heap ceiling for Safari was found. [Bugnet — Unity WebGL crashing on Safari iOS](https://bugnet.io/blog/how-to-fix-unity-webgl-build-crashing-on-safari-ios)
- The activation-gate doc's `BanaBackground.tsx` already handles `webglcontextlost` for raw WebGL; that defensive pattern is validated as necessary, not hypothetical, by the above reports — a Unity-engine build losing context mid-session is a materially worse failure mode than a background shader doing so, exactly as §3.3 of the doc argues.

### 2. Realistic minimum WebGL build size (Unity 6, IL2CPP, stripping High, Brotli)

- **A genuinely empty Unity 6 scene, aggressively hand-optimized** (disabled splash/logo, removed default input system/UI packages, IL2CPP disk-size-optimized codegen with LTO, managed stripping High, Brotli, content-hashed naming), reaches **~2.0-2.2 MB compressed total**. This is *below* the doc's placeholder floor of "~4-8 MB." Confidence: high — two independent, detailed, numbers-first sources converge on the same figure. [Aras Pranckevičius — Unity 6 empty web build file sizes (gist)](https://gist.github.com/aras-p/740c2d4f9977ce92b7de72b1394dd365) · [Playgama — shrinking an empty Unity build from 10 MB to 2 MB](https://playgama.com/blog/unity/how-to-shrink-empty-unity-build-from-10mb-to-2mb/)
- **The unoptimized starting point is much higher**: a default Unity 6 3D URP template build reported at **~10.7 MB compressed** before any optimization work, and a separate report of an empty Built-in-Pipeline scene starting at **~9.7 MB compressed**. Most of the excess in both cases came from URP post-processing textures (film grain, blue noise) and the Unity splash screen asset — not from "engine floor" per se. Confidence: high (same two sources as above).
- **Community consensus on "smallest possible" WebGL build size without extreme custom tooling clusters around ~5-7 MB Brotli-compressed**, which sits inside the doc's stated 4-8 MB range. Confidence: medium (forum/blog aggregation, not a single authoritative benchmark). [Radiator Blog — Unity WebGL tips/advice](https://www.blog.radiator.debacle.us/2023/01/unity-webgl-tips-advice-in-2023.html)
- **For a small shipped 2D game**, one documented case reports a graphics-light 2D game at **~20 MB compressed, dominated by audio/music assets** rather than engine or code weight, and a separate 2021.3-era project at **~7.8 MB compressed** (with a further ~20% size increase reported after upgrading to Unity 2022). These bracket the doc's "10-25 MB small shipped game" estimate reasonably well, with the caveat that audio content — not the engine — is the swing factor. Confidence: medium (individual developer reports, not a systematic sample). [Unity Discussions — WebGL build size optimization thread](https://discussions.unity.com/t/webgl-build-size-optimization/1673907)
- **Correction to the doc's placeholder table**: the doc listed `.wasm` (IL2CPP) at "~3-6 MB" as if that were close to a hard floor. The sourced data shows the wasm/code component itself can be brought down to **~1.5 MB compressed** with disk-size-optimized IL2CPP + LTO + aggressive package removal — the doc's wasm estimate was too pessimistic for a genuinely minimal scene, though it becomes realistic again once actual gameplay code and referenced engine subsystems (physics, UI, input) are added back in, which is the case for any real feature.
- Net assessment: **the doc's 4-8 MB / 10-25 MB placeholder pair is a fair estimate for a team doing moderate-but-not-extreme optimization**, slightly conservative on the empty-scene floor (true floor is lower, ~2 MB) and roughly accurate on the small-shipped-game ceiling. Brotli is confirmed as materially better than gzip (a Unity manual page and multiple third-party sources agree, ~15-25% smaller), with the caveat that Brotli requires HTTPS and a server that sends `Content-Encoding: br` — directly relevant to the doc's §5.3 note about the `/api/r2/[...key]` proxy not supporting this today. [Unity Manual — Distribution size and code stripping](https://docs.unity3d.com/6000.0/Documentation/Manual/webgl-distributionsize-codestripping.html)

### 3. Licensing terms and CI activation mechanics

- **Unity Personal (free) financial threshold is $200,000 USD in trailing-12-month revenue and funding combined** — Unity confirms it scrapped the earlier per-install Runtime Fee entirely and raised the Personal ceiling to this figure as of the Unity 6 release (Oct 17, 2024). A company over this threshold "may not use Unity Personal at all, even for internal projects or prototyping." Confidence: high. [Unity — Pricing changes announcement](https://unity.com/products/pricing-updates) · [Unity blog — Canceling the Runtime Fee](https://unity.com/blog/unity-is-canceling-the-runtime-fee)
- **Unity Pro is required above the $200,000 threshold and below $25,000,000; Unity Enterprise above $25M.** Pro list price is **$2,310/seat/year** effective **January 12, 2026** (a 5% increase from the prior rate; this is the currently-quoted figure, not a historical one). Enterprise pricing is quote-only ("on enquiry"). Confidence: high, primary/near-primary sourcing. [CG Channel — Unity subscription price rise for 2026](https://www.cgchannel.com/2025/11/price-of-paid-unity-subscriptions-to-rise-but-free-subs-extended/) · [Unity — Pricing changes](https://unity.com/products/pricing-updates)
- **Unity's own Terms of Service explicitly forbid using Unity Build Server on the Personal tier.** Build Server (the officially sanctioned floating-license mechanism for headless/automated builds) requires an active Pro, Enterprise, or Industry subscription. This directly answers doc §9 item 3's CI-activation question: **a fintech company over the $200K threshold cannot legally run automated Unity CI builds on a free license, full stop** — it is not merely "recommended" to upgrade, it is contractually required for both general use and specifically for any build-server/CI use. Confidence: high. [Unity Support — "What is a Seat?"](https://support.unity.com/hc/en-us/articles/210247053-What-is-a-Seat) (Build Server terms page itself, `unity.com/legal/terms-of-service/build-server`, returned HTTP 403 on direct fetch — see Open Questions)
- **Unity Build Server is a separate paid product from an authoring seat**, priced identically to a Pro seat (**$2,310/year**) for the Pro tier, and provisions floating CI-build capacity without consuming a human authoring seat. Enterprise bundles some Build Server licenses per block of 20 Enterprise seats (10 licenses per 20 seats, up to a cap of 30). Confidence: medium — sourced from a search-result synthesis rather than a directly-fetched Unity primary page (the terms/product page 403'd on direct fetch); cross-referenced against a third-party reseller listing a matching price. [Unity — Build Server product page](https://unity.com/products/unity-build-server) (fetch blocked; price corroborated by third-party reseller listing at [congeriem.com](https://www.congeriem.com/unity-pro-build-server-esd-license.html))
- **In practice, `game-ci`/community CI pipelines commonly bypass the official Build Server product** by activating a regular Personal `.ulf` file or a Pro serial (`UNITY_SERIAL` + email/password) directly inside the CI runner, then explicitly "returning" the license after each build to free the activation slot. This is a documented, widely-used pattern, but it is a workaround built on a regular seat's activation limit rather than the dedicated floating-license product Unity sells for this purpose — it is fragile under concurrent CI runs and is a compliance gray area worth flagging separately from the sanctioned Build Server path. Confidence: medium. [GameCI — Activation docs](https://game.ci/docs/github/activation/) · [buildalon/activate-unity-license](https://github.com/buildalon/activate-unity-license)
- **Bottom line for a BANA-scale commercial CI use case**: realistically Pro tier (BANA almost certainly exceeds $200K revenue/funding as a live custody platform — confirm formally, see Open Questions), at minimum one Pro seat ($2,310/yr) for whoever maintains the project, plus either a Build Server license ($2,310/yr) for sanctioned CI or the unofficial serial-activation-and-return workaround via `game-ci` at no extra licensing line-item but with the fragility noted above.

### 4. `game-ci/unity-builder` maintenance status and CI resource cost

- **`game-ci/unity-builder` is actively maintained.** Latest observed release is **v5.0.0**, with a recent release cadence (v4.8.1, v4.8.0, v4.7.0, v4.6.3 preceding it), migration to Node.js 24, and ongoing community PR activity. The project's own stated adoption figure is 25,000+ teams. Confidence: high. [game-ci/unity-builder — Releases](https://github.com/game-ci/unity-builder/releases)
- **Current published Docker images for a Unity 6 + WebGL-module editor run ~7-7.5 GB compressed** (e.g., `unityci/editor:ubuntu-6000.5.7f1-webgl-3.2.2` at ~7.38 GB). This is larger than the doc's vague "multi-gigabyte" characterization suggests as a lower bound — it is worth pinning down to "~7 GB class" rather than leaving it unspecified in any future proposal's cost accounting (CI runner pull time, cache storage, egress). Confidence: high (direct Docker Hub tag listing). [Docker Hub — unityci/editor tags](https://hub.docker.com/r/unityci/editor/tags?name=webgl)
- **There is an unresolved discrepancy on image size**: a `game-ci/docker` GitHub issue reports the editor image being cut from ~3 GB to ~1 GB via cleanup of templates, unused Mono resources, .NET Core SDKs, and debug files — but the currently-published WebGL-tagged tags on Docker Hub are ~7x that reduced figure. It is unclear whether that optimization effort ever shipped into the officially published `unityci/editor` WebGL images, or applies to a different/lite image variant not currently tagged for WebGL. Flagging as a contradiction rather than resolving it (see below). [game-ci/docker issue #74](https://github.com/game-ci/docker/issues/74)
- **Real-world reported WebGL build durations run longer than the doc's 10-30 minute placeholder.** One documented working CI/CD pipeline (not `game-ci` specifically, but structurally comparable — GitHub Actions + Unity WebGL) reports **60-120 minutes for a clean build on a "moderately complex" project**, dropping to **30-50 minutes with proper `Library/` folder caching**. This is directionally consistent with the doc's qualitative claim ("this cannot run inside every deploy") but the doc's specific 10-30 minute number should be treated as optimistic/lower-bound rather than typical. Confidence: medium — single detailed source, self-reported, project-complexity-dependent by nature. [Adil Bouchnita — CI/CD for Unity WebGL](https://adilbouchnita.com/blog/cicd-unity-webgl)

## Contradictions

- **Official "supported browser version" listing vs. Unity's own hedged device-tier guidance vs. live crash reports.** The Unity 6 manual publishes a clean supported-version table (iOS Safari 15+, Android Chrome 58+) with no caveats on that specific page — reads as "supported, full stop." But Unity's own product announcement scoped realistic support to "high-end mobile devices released in the last two or three years," and independent bug trackers/forums show ongoing context-loss and crash reports through iOS 18.x in 2025. All three are Unity-adjacent or Unity-primary sources and they do not agree on how confidently "supported" should be read for BANA's actual (mid/low-tier Android-skewed) device mix. Do not silently resolve this — a future proposal needs to test on BANA's real device distribution, not trust the manual's version table alone.
- **`game-ci/docker` image size**: a maintainer-reported optimization down to ~1 GB (GitHub issue #74) versus ~7-7.5 GB on the currently live Docker Hub WebGL-tagged images. Not reconciled — see Open Questions.
- **Build-size floor**: the doc's own placeholder (~4-8 MB) versus the sourced achievable floor with aggressive optimization (~2 MB) versus the sourced "typical/out-of-box" floor before optimization work (~9-11 MB). All three numbers are individually sourced and real; they describe different points on an optimization-effort curve, not a single contradiction to resolve, but a future proposal should specify which point on that curve its POC number represents.

## Open Questions

- **What is BANA's actual trailing-12-month revenue + funding figure**, to formally confirm Personal-tier ineligibility (near-certain given it's a live custody platform, but the licensing conclusion in Finding 3 should be confirmed against actual financials, not assumed) — this is a finance/internal question, not something `researcher` can source externally.
- **The official Unity Build Server terms page (`unity.com/legal/terms-of-service/build-server`) and the official product page (`unity.com/products/unity-build-server`) both returned HTTP 403 on direct fetch** in this session. The pricing and seat-bundling claims in Finding 3 rely on secondary/reseller corroboration rather than a directly-fetched Unity primary page. Re-attempt via an authenticated browser or Unity's sales contact to get the primary-source text verbatim before any proposal treats the $2,310/yr Build Server figure as final.
- **Why does the `game-ci/docker` 1 GB image-size optimization (issue #74) not appear reflected in current Docker Hub WebGL tags (~7 GB)?** Was it merged into a different image variant, reverted, or never shipped for the WebGL target specifically? Would need a direct read of `game-ci/docker`'s current Dockerfile history/CHANGELOG to settle.
- **No official Apple or Unity primary source was found stating a specific numeric iOS Safari WebGL heap ceiling** (the ~300-500 MB figure is third-party-blog-sourced). Settling this would need either an Apple WebKit engineering doc or controlled first-party testing (a tier-3 or eventual tier-4 POC would surface the real number directly).
- **No first-party benchmark exists for "trivial 2D game" (match-3/simple platformer) WebGL size specifically** — the two data points sourced (20 MB audio-heavy, 7.8 MB code-only-ish) are individual developer reports, not a systematic sample across genre/asset-mix. A real POC build (per doc §8 re-evaluation trigger #2) is the only way to get a BANA-relevant number.

## Sources

All retrieved 2026-08-05.

- https://docs.unity3d.com/6000.4/Documentation/Manual/webgl-browsercompatibility.html
- https://docs.unity3d.com/6000.4/Documentation/Manual/webgl.html
- https://docs.unity3d.com/6000.4/Documentation/Manual/webgl-memory.html
- https://docs.unity3d.com/6000.4/Documentation/Manual/webgl-gettingstarted.html
- https://docs.unity3d.com/6000.0/Documentation/Manual/webgl-distributionsize-codestripping.html
- https://unity.com/blog/engine-platform/web-runtime-updates-enhance-browser-experience (fetch returned HTTP 403; content triangulated via search)
- https://unity.com/blog/engine-platform/unity-6-preview-release
- https://discussions.unity.com/t/webgl-context-lost-ios-17-safari/930432
- https://discussions.unity.com/t/webgl-memory-increment-issue-and-crash-on-ios/894771
- https://discussions.unity.com/t/webgl-safari-crashes-after-ios-upgrade-to-15-4-1/878798
- https://issuetracker.unity3d.com/issues/memory-usage-increased-in-newer-versions-when-using-safari
- https://developer.apple.com/forums/thread/778735
- https://bugnet.io/blog/how-to-fix-unity-webgl-build-crashing-on-safari-ios
- https://gist.github.com/aras-p/740c2d4f9977ce92b7de72b1394dd365
- https://playgama.com/blog/unity/how-to-shrink-empty-unity-build-from-10mb-to-2mb/
- https://www.blog.radiator.debacle.us/2023/01/unity-webgl-tips-advice-in-2023.html
- https://discussions.unity.com/t/webgl-build-size-optimization/1673907
- https://discussions.unity.com/t/smallest-possible-webgl-build-size/917019
- https://unity.com/products/pricing-updates (fetch returned HTTP 403; content triangulated via search)
- https://unity.com/blog/unity-is-canceling-the-runtime-fee
- https://www.cgchannel.com/2025/11/price-of-paid-unity-subscriptions-to-rise-but-free-subs-extended/
- https://support.unity.com/hc/en-us/articles/210247053-What-is-a-Seat
- https://unity.com/legal/terms-of-service/build-server (fetch returned HTTP 403, not independently verified)
- https://unity.com/products/unity-build-server (fetch blocked in search synthesis, not independently verified)
- https://www.congeriem.com/unity-pro-build-server-esd-license.html
- https://game.ci/docs/github/activation/
- https://github.com/buildalon/activate-unity-license
- https://github.com/game-ci/unity-builder/releases
- https://hub.docker.com/r/unityci/editor/tags?name=webgl
- https://github.com/game-ci/docker/issues/74
- https://adilbouchnita.com/blog/cicd-unity-webgl
