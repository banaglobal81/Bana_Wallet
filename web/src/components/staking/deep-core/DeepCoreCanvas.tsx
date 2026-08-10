'use client';

import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { DeepCoreScene, type CrewState, type DeepCoreWellView } from './scene/DeepCoreScene';

// docs/specs/deep-core-05-screen-flow-frd.md §2.3 / G-1 — internal resolution
// is FIXED at 960×540 regardless of breakpoint (device-class heuristics are
// explicitly forbidden, G-6). The CSS box around this canvas is sized by the
// parent (DeepCoreEmbed) per breakpoint; Scale.FIT + CENTER_BOTH does the
// rest without this component ever reading `window.innerWidth`.
const INTERNAL_WIDTH = 960;
const INTERNAL_HEIGHT = 540;

export interface DeepCoreCanvasProps {
  chapter: number;
  wells: DeepCoreWellView[];
  crew: Record<string, CrewState>;
  motionReduced: boolean;
  /** Bumped by the parent whenever a new lift should play its one-shot burst (05 §3.3). */
  liftBurstToken: number;
  onWellClick?: (positionId: string) => void;
  /** Called once if Phaser fails to boot (G-5) — parent falls back to a static image. */
  onBootError?: () => void;
}

// Kept as its own component (not inlined into DeepCoreEmbed) specifically so
// it's the thing behind the `next/dynamic(..., { ssr: false })` boundary —
// this file is the only one in the tree that does `import Phaser from
// 'phaser'` (G-2 / AC-S2: S-0 users never even parse this file).
export default function DeepCoreCanvas({
  chapter, wells, crew, motionReduced, liftBurstToken, onWellClick, onBootError,
}: DeepCoreCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<DeepCoreScene | null>(null);
  const onWellClickRef = useRef(onWellClick);
  onWellClickRef.current = onWellClick;

  // Boot once. Prop changes after boot go through the scene's own update
  // methods below (recreating the Phaser.Game per prop change would be far
  // heavier than necessary and would restart every tween/animation).
  useEffect(() => {
    if (!containerRef.current) return undefined;

    let destroyed = false;
    let game: Phaser.Game | null = null;
    try {
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current,
        width: INTERNAL_WIDTH,
        height: INTERNAL_HEIGHT,
        transparent: true,
        banner: false,
        fps: { target: 30, forceSetTimeOut: true },
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
          width: INTERNAL_WIDTH,
          height: INTERNAL_HEIGHT,
        },
        scene: [DeepCoreScene],
        callbacks: {
          postBoot: (g) => {
            if (destroyed) return;
            const scene = g.scene.getScene('DeepCoreScene') as DeepCoreScene;
            sceneRef.current = scene;
          },
        },
      });
      game.scene.start('DeepCoreScene', {
        chapter, wells, crew, motionReduced,
        onWellClick: (id: string) => onWellClickRef.current?.(id),
      });
      gameRef.current = game;
    } catch (e) {
      console.error('[deep-core] Phaser boot failed', e);
      onBootError?.();
    }

    return () => {
      destroyed = true;
      sceneRef.current = null;
      game?.destroy(true);
      gameRef.current = null;
    };
    // Boot is intentionally one-time — see the effects below for prop-driven updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneRef.current?.setWells(wells);
  }, [wells]);

  useEffect(() => {
    sceneRef.current?.setCrewState(crew);
  }, [crew]);

  useEffect(() => {
    if (sceneRef.current) sceneRef.current.crossfadeToChapter(chapter);
  }, [chapter]);

  const firstBurst = useRef(true);
  useEffect(() => {
    if (firstBurst.current) { firstBurst.current = false; return; } // don't burst on initial mount
    sceneRef.current?.playLiftBurst();
  }, [liftBurstToken]);

  return <div ref={containerRef} className="absolute inset-0" data-testid="deep-core-canvas-root" />;
}
