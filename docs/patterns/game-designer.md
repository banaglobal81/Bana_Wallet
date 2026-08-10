# Pattern Library — game-designer

Read on demand by `game-designer` only, when the current task's scope overlaps an entry below. See `CLAUDE.md` § Agent Self-Update Protocol for edit rules.

## make-image pipeline (`/Users/bana/projects/bana-marketing/make-image`)

- **Never name a specific game title as a style reference in the prompt** (e.g. "like
  Hay Day", "like Township"). `gemini-2.5-flash-image` sometimes treats the name as a
  literal content cue, not a style cue, and draws actual farm/windmill/barn-animal
  scenes instead of just adopting the flat-vector look — happened on 5/33 images in
  the 2026-08-10 DEEP CORE Phase 0 batch (`dc_bg_ch2_sky`, `dc_bg_ch1_fore`,
  `dc_bg_ch1_mid`, `dc_icon_xp`, `dc_fx_lift_burst_ch1`). Fix: describe the style
  purely adjectivally ("bold clean silhouettes, flat cel-shading, thin dark
  outlines") and add an explicit negative list of the leaked content once you've
  identified it, then regenerate under the same `--id` (campaign mode overwrites the
  file + manifest entry in place, no separate cleanup needed).
- **Small/abstract UI icon prompts are the most prone to unwanted object bleed-through**
  even without a game-title trigger — e.g. an "XP icon" prompt in a wallet-app project
  context came back with a whole wallet illustration behind the intended chevron
  glyph. For single-glyph icons, be maximally explicit ("nothing else in the frame,
  no wallet, no card, no coin, no badge frame — just the shape itself") and verify
  visually before trusting the result.
- **The pipeline never produces true alpha transparency directly** — every image comes
  back with an opaque background even when you don't ask for one. For sprite/icon
  assets that need transparency, prompt for "flat solid magenta (#FF00FF) background,
  chroma-key" and post-process with a small PIL script that auto-samples the actual
  corner-pixel color (the model does NOT reproduce pure `#FF00FF` — it drifts to a
  hot-pink/magenta-ish tone that varies slightly per image) rather than assuming pure
  magenta as the key color. A fixed-magenta assumption produced zero transparency on
  a first pass; corner-sampling fixed it. System `python3` (not the pipeline's own
  `.venv`, which has no PIL/numpy) has Pillow available — use that for post-processing.
- **The `Read` tool's image preview does not composite alpha** — a correctly-matted
  transparent PNG will still visually preview as solid-background in `Read` (it shows
  raw RGB ignoring alpha). Don't conclude matting failed from the preview alone;
  verify with a quick script that checks corner-pixel alpha values, or composite onto
  a known background color (e.g. the site's `#06132a`) and preview that instead.
- **No wide/ultra-wide aspect ratios beyond standard ones** (`--aspect-ratio` is only
  format-validated locally, e.g. `N:N`, but very wide ratios like the asset
  manifest's `1920:540` (~3.5:1) either fail or get rendered letterboxed inside a
  more standard ratio). Generate at `16:9` instead and treat true wide-parallax
  canvas extension as a documented follow-up (outpainting/tiling), not something this
  pipeline does in one shot.
- **This project's own R2 bucket (`familybana`) is unrelated to Bana_Wallet's product
  R2 (`banawallet`)** — don't `--upload-r2` game assets there, it would mix an
  unrelated marketing project's bucket into wallet product assets. For static,
  build-time, first-party game art (not admin-uploaded dynamic content), saving
  directly under `web/public/game/<tree-name>/` is simpler and more idiomatic for
  this repo than routing through R2 + a proxy API route — no code changes required,
  Next.js serves `public/` automatically. Bana_Wallet's R2 (`/api/r2/<key>`) is
  reserved for admin-uploaded dynamic content (coin/brand logos) with an explicit
  `ALLOWED_PREFIXES` allowlist in `web/src/app/api/r2/[...key]/route.ts` — extending
  that allowlist is a code change outside this agent's scope, so it's not a fit for
  bulk static game-asset hosting anyway.
- **Shared Vertex AI quota is 2 requests/minute** — for a batch of N images, budget at
  least `N * ~40s` wall-clock time. A sequential Python driver script with
  `time.sleep(38)` between calls (run via Bash, `run_in_background` for anything
  beyond a few images) is simpler than trying to parallelize (which would just
  increase 429 retries against the shared quota).

## Multi-panel / grid sheet prompts (crew action sheets, character turnarounds)

- **A single-generation grid/sprite-sheet prompt (e.g. "3x2 grid of 6 cells, 5 poses of
  the same character") is prone to the model baking in cell-number digits ("1"-"6") in
  the corners and adding an unwanted white/grey margin border around the whole grid**
  even when the base style-lock prompt already says "no text, no numbers" — the
  multi-cell/reference-sheet framing seems to trigger it independently. Fix: add an
  explicit second negative clause targeted at this specific failure mode ("no numbers,
  no digits, no numerals, no labels, not even small ones in the corners" + "no
  grey/white margin border around the outside of the grid, fill the entire canvas edge
  to edge") — happened on 1/6 action sheets in the 2026-08-10 DEEP CORE Phase 0 batch 2
  (`dc_crew_boss_actionsheet_ch1`), the other 5 didn't need the extra clause (model
  behavior isn't deterministic even with an identical prompt template across
  characters).
- **`--edit-image` (feeding the flawed prior image back in as multimodal input) is the
  wrong tool for fixing a structural/compositional flaw** like baked-in numbers or a
  wrong border — the model reproduces the flaw from the reference image instead of
  correcting it. For structural fixes, regenerate from scratch with just `--id` +
  `--manifest` (no `--edit-image`/`--reference-image`) and a strengthened prompt, not
  an edit pass. `--edit-image` is better suited to targeted content tweaks on an
  otherwise-correct image (e.g. batch 1's "make the background X instead of Y").
- **For multi-cell prompts, "subject isolated on a flat magenta background" (fine for
  single-subject icons) is not strong enough to guarantee EVERY cell's interior is also
  magenta** — a first regeneration attempt produced numbers-free output but with a
  cream/off-white background inside each character cell (only the gaps between cells
  were magenta). Needed an explicit "every single pixel of the background in ALL cells,
  including directly behind each subject, must be the same flat magenta -- no
  card/frame color, not even inside the cells" to get uniform chroma-key coverage
  across the whole sheet.
- **Character consistency across poses within the SAME single generation call is
  noticeably better than consistency across separate calls** (e.g. the same character's
  chapter-1 sheet vs chapter-2 sheet, generated in two different API calls, still won't
  match reliably per docs/specs/deep-core-07-art-style-guide.md §7) — useful to know
  when deciding whether something needs to be one multi-pose image or several
  single-pose images.
- **A multi-cell grid sheet is not a drop-in sprite atlas** — cell boundaries are only
  visually even, not guaranteed to fall on exact pixel coordinates. Treat the output as
  reference/source art requiring a human (or `game-developer`) to confirm crop
  coordinates before slicing into individual game-ready frames, not as something safe
  to auto-slice by dividing width/height evenly.

## Phase 0 vs P1 scope boundary (compliance-adjacent, verify against current `pm` sign-off before reuse)

- The `deep-core` game family's Phase 0 gate (`docs/specs/deep-core-00-overview-and-gate.md`
  §6.5 Q4) forbids CC/gear-track/MP/bonus-related UI and assets, **no teasers either**.
  This is easy to over-read as "no equipment art at all" — it isn't. The distinction
  that matters is the unlock **type** in `deep-core-02-progression-frd.md` §4.1:
  `rig_silhouette` (level/chapter-driven, "no income impact") is in scope;
  `gear_tier_cap` (CC-purchased, MP-tied, explicitly P1-gated) is not. When a task
  description says something like "장비의 시각적 업그레이드" (equipment's visual
  upgrade), check which unlock type it actually maps to before producing assets —
  don't assume the phrase means the CC-gated gear-track system.
