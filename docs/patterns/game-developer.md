# Pattern Library — game-developer

Read on demand by `game-developer` only, when the current task's scope overlaps an entry below. See `CLAUDE.md` § Agent Self-Update Protocol for edit rules.

## DeepCoreEmbed no longer bundles the B4 control bar (2026-08-10)

`docs/specs/staking-page-v2-screen-flow-frd.md` requires page order
B1(canvas)→B2(YIELD PANEL)→B3(VAULT BAR)→B4(RIG BAR/control bar). Earlier
`DeepCoreEmbed.tsx` rendered `DeepCoreControlBar` (Crew/Depot/Ledger) inside
its own returned tree, right after the canvas box, which forced the actual
page order to B1→B4→B2→B3 wherever `Staking.tsx` mounted it as "the one
insertion point." Fixed by splitting the control bar out as a second, sibling
export from the same module rather than changing `Staking.tsx` myself (that
wiring is `web-wallet-expert`'s call):

- `export { default as DeepCoreControlBar } from './DeepCoreControlBar';` —
  re-exported from `DeepCoreEmbed.tsx` so callers have one import site for the
  whole DEEP CORE surface.
- `export function deriveDeepCoreCrewState(game): Record<string, CrewState>` —
  the crew-state precedence logic (deep-core-01-world-bible.md §4.3:
  reporting-paused > idle-rig > working) pulled out of `DeepCoreEmbed`'s
  internal `useMemo` so a standalone `<DeepCoreControlBar>` render site can
  derive the same `crewState` from the same `game` prop without duplicating
  the logic.

Lesson: when a "single insertion point" component's own contract conflicts
with a page-level ordering requirement from the FRD, don't force the FRD's
component to live in the wrong DOM position — split the component's exports
so the wrong-position piece becomes its own insertion point, and let the page
owner place it correctly. Keep the split's tests colocated: canvas-tree
behavior stays in `DeepCoreEmbed.test.tsx`, the extracted piece gets its own
`DeepCoreControlBar.test.tsx`.
