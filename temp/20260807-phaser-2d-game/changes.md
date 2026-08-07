# Changes — Phaser / 2D game scoping (2026-08-07)

## What is changing
Docs only. No code, no dependency, no `package.json` edit.

- **New:** `docs/specs/2d-game-phaser-scoping.md` — a product scoping note answering
  "is Phaser a good choice for a 2D game in BANA?" at the product level (Why), not the
  implementation level (How).

## Why
The master asked whether Phaser is a good fit for attaching a web 2D game to the wallet.
The question arrived as a **technology** question, but no one has stated the **product
purpose** of the game — gamified rewards, loyalty/quest system, onboarding, or something
else. Answering "yes, Phaser" before the purpose exists would lock in a dependency for an
unnamed feature.

This repo already has precedent: a full Unity/C# WebGL engine was evaluated and the call
was **do not activate** — no heavy game-engine dependency without product sign-off. Those
docs (`docs/specs/unity-engine-evaluation.md` and its supporting research) were deleted
today at the master's request during an unrelated cleanup, along with the `unity-fx-expert`
agent. The precedent stands even though the paper trail is gone; this note re-anchors it in
one short doc so the next person asking does not start from zero.

Phaser is a materially smaller commitment than Unity (one npm package, pure TS, no separate
build toolchain), so this is a scoping note, not a full evaluation. The gate is the same
gate, set lower.

## Explicitly NOT in this change
- No feature spec for the game itself. Nobody has said what it is for; inventing a
  gamification mechanic here would be fiction.
- No final Phaser-vs-alternatives technical verdict. That is a feasibility call for
  `web-wallet-expert` (now owns `web/src/components/` broadly, including the existing
  raw-WebGL `BanaBackground.tsx` FX), and it should only be spent once a use case exists.

## Scope boundary noted in the doc
Decorative background FX is already solved and is **out of scope** — `BanaBackground.tsx`
is hand-written WebGL and nothing here proposes changing it. This is about actual gameplay:
sprites, physics/collision, scenes, game state.
