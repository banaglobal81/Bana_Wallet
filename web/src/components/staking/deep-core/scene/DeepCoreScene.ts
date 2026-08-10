import Phaser from 'phaser';
import { chapterTheme } from '../chapterTheme';
import {
  chaptersToLoad, backgroundLayerAsset, rigSilhouetteAsset, wellAsset, crewIdleSpriteAsset,
  type BgLayer, type DeepCoreAsset,
} from '../assetManifest';
import type { CrewId } from '@/lib/deepCoreChapters';

// DEEP CORE Phaser scene.
//
// Real art (docs/specs/deep-core-08-asset-manifest-phase0-batch1.md, 33 of
// the 06 manifest's 431 assets so far) is wired in via assetManifest.ts's
// resolvers, keyed by manifest id (used directly as the Phaser texture
// key). Every draw function below tries the resolved asset first and falls
// back to the original procedural Phaser Graphics shape whenever: (a) the
// id isn't in the manifest yet (§6 backlog — chapters 3-6 backgrounds,
// most crew states, etc.), or (b) the file is listed but fails to load at
// runtime (`failedTextureKeys`, populated from the loader's `loaderror`
// event). No path is ever hardcoded here — everything comes from
// assetManifest.ts, so a future batch drops in with zero changes to this
// file. Same layer structure (05 §3.1: sky/mid/well-field/rig/crew/fore/
// effects), same animation budget (≤24 concurrent tweens, 05 §3.1), same
// 30fps cap (set on the game config, not here).
//
// R-4 / M-1 (asset manifest): no text is ever drawn to the canvas. Every
// number/label the player reads lives in DeepCoreHud.tsx (DOM).

export type CrewState = 'idle' | 'working' | 'waiting' | 'idle_empty' | 'chapter_up';

export interface DeepCoreWellView {
  positionId: string;
  relativeSize: number; // 0..1, termDays relative to the user's own longest term (05 AC-S12 — never principal)
  active: boolean;
}

export interface DeepCoreSceneInitData {
  chapter: number;
  wells: DeepCoreWellView[];
  crew: Record<string, CrewState>;
  motionReduced: boolean;
  onWellClick?: (positionId: string) => void;
}

const MAX_VISIBLE_WELLS = 6;
const CHAPTER_CROSSFADE_MS = 1500;

// Vertical split for the 3 parallax bands — unchanged from the original
// procedural layout (top 45% sky / next 35% mid / bottom 20% fore), now
// used both for the solid-color fallback rect AND as the crop window taken
// from each layer's own (full-frame) source image.
const BG_BANDS: Record<BgLayer, [number, number]> = {
  sky: [0, 0.45],
  mid: [0.45, 0.8],
  fore: [0.8, 1],
};

export class DeepCoreScene extends Phaser.Scene {
  private chapter = 1;
  private motionReduced = false;
  private crewState: Record<string, CrewState> = {};
  private wells: DeepCoreWellView[] = [];
  private onWellClick?: (positionId: string) => void;

  private bgLayerA?: Phaser.GameObjects.Container;
  private bgLayerB?: Phaser.GameObjects.Container;
  private contrastBands?: Phaser.GameObjects.Graphics;
  private rig?: Phaser.GameObjects.Container;
  private wellField?: Phaser.GameObjects.Container;
  private crewField?: Phaser.GameObjects.Container;
  private activeTweens: Phaser.Tweens.Tween[] = [];
  private focusRing?: Phaser.GameObjects.Arc;
  private focusResetEvent?: Phaser.Time.TimerEvent;

  private queuedTextureKeys = new Set<string>();
  private failedTextureKeys = new Set<string>();

  constructor() {
    super('DeepCoreScene');
  }

  init(data: DeepCoreSceneInitData): void {
    this.chapter = data.chapter;
    this.wells = data.wells;
    this.crewState = data.crew;
    this.motionReduced = data.motionReduced;
    this.onWellClick = data.onWellClick;
  }

  preload(): void {
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: { key: string }) => {
      this.failedTextureKeys.add(file.key);
    });
    const assets = new Map<string, DeepCoreAsset>();
    chaptersToLoad(this.chapter).forEach((c) => this.collectChapterAssets(c).forEach((a) => assets.set(a.id, a)));
    Object.keys(this.crewState).forEach((id) => {
      const asset = crewIdleSpriteAsset(id as CrewId);
      if (asset) assets.set(asset.id, asset);
    });
    assets.forEach((a) => this.queueImage(a.id, a.publicPath));
  }

  /** Every manifest asset the (procedural-fallback-aware) draw functions
   * could use for `chapter`, resolved once so preload/runtime-load/draw all
   * agree on exactly the same set. */
  private collectChapterAssets(chapter: number): DeepCoreAsset[] {
    const found: (DeepCoreAsset | undefined)[] = [
      backgroundLayerAsset(chapter, 'sky'),
      backgroundLayerAsset(chapter, 'mid'),
      backgroundLayerAsset(chapter, 'fore'),
      rigSilhouetteAsset(chapter),
      wellAsset(chapter, 'small', true),
      wellAsset(chapter, 'large', true),
    ];
    return found.filter((a): a is DeepCoreAsset => a != null);
  }

  private queueImage(key: string, url: string): void {
    if (this.textures.exists(key) || this.queuedTextureKeys.has(key)) return;
    this.queuedTextureKeys.add(key);
    this.load.image(key, url);
  }

  private textureReady(id: string): boolean {
    return this.textures.exists(id) && !this.failedTextureKeys.has(id);
  }

  /** Loads any of `chapter`'s assets that aren't already in the texture
   * cache (runtime chapter jump beyond the ±1 preload window, e.g. a
   * multi-chapter catch-up), then calls `onReady` — synchronously if
   * nothing was missing, so the common case (chapter ±1, already
   * preloaded) never waits a frame. */
  private ensureChapterAssetsLoaded(chapter: number, onReady: () => void): void {
    const missing = this.collectChapterAssets(chapter).filter(
      (a) => !this.textures.exists(a.id) && !this.failedTextureKeys.has(a.id),
    );
    if (missing.length === 0) { onReady(); return; }
    missing.forEach((a) => this.queueImage(a.id, a.publicPath));
    this.load.once(Phaser.Loader.Events.COMPLETE, onReady);
    this.load.start();
  }

  create(): void {
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');

    this.bgLayerA = this.add.container(0, 0).setDepth(0);
    this.bgLayerB = this.add.container(0, 0).setDepth(0).setAlpha(0);
    this.drawBackground(this.bgLayerA, this.chapter);

    this.rig = this.add.container(0, 0).setDepth(3);
    this.drawRig();

    this.wellField = this.add.container(0, 0).setDepth(2);
    this.drawWells();

    this.crewField = this.add.container(0, 0).setDepth(4);
    this.drawCrew();

    // Top/bottom 12% low-contrast bands so the DOM HUD stays legible over
    // any chapter palette (deep-core-01-world-bible.md §6.2 / M-6).
    this.contrastBands = this.add.graphics().setDepth(6);
    this.drawContrastBands();

    if (!this.motionReduced) this.startIdleBob();
  }

  private drawBackground(container: Phaser.GameObjects.Container, chapter: number): void {
    container.removeAll(true);
    const theme = chapterTheme(chapter);
    const { width, height } = this.scale;
    (Object.keys(BG_BANDS) as BgLayer[]).forEach((layer) => {
      const [from, to] = BG_BANDS[layer];
      const asset = backgroundLayerAsset(chapter, layer);
      if (asset && this.textureReady(asset.id)) {
        container.add(this.buildBandImage(asset.id, from, to));
        return;
      }
      const g = this.add.graphics();
      g.fillStyle(layer === 'sky' ? theme.sky : layer === 'mid' ? theme.mid : theme.fore, 1);
      g.fillRect(0, height * from, width, height * (to - from));
      container.add(g);
    });
  }

  /** Crops the same relative vertical band out of a (full-frame) layer
   * image that the procedural fallback would have flat-filled, then
   * stretches that crop to cover the band on the internal 960×540 canvas. */
  private buildBandImage(key: string, from: number, to: number): Phaser.GameObjects.Image {
    const { width, height } = this.scale;
    const src = this.textures.get(key).getSourceImage() as { width: number; height: number };
    const cropY = Math.round(src.height * from);
    const cropH = Math.max(1, Math.round(src.height * (to - from)));
    const img = this.add.image(0, height * from, key).setOrigin(0, 0);
    img.setCrop(0, cropY, src.width, cropH);
    img.setDisplaySize(width, height * (to - from));
    return img;
  }

  private drawContrastBands(): void {
    if (!this.contrastBands) return;
    const { width, height } = this.scale;
    const band = height * 0.12;
    this.contrastBands.clear();
    this.contrastBands.fillStyle(0x020d24, 0.35);
    this.contrastBands.fillRect(0, 0, width, band);
    this.contrastBands.fillRect(0, height - band, width, band);
  }

  private drawRig(): void {
    if (!this.rig) return;
    this.rig.removeAll(true);
    const { width, height } = this.scale;
    const cx = width / 2;
    const baseY = height * 0.78;
    const theme = chapterTheme(this.chapter);
    const asset = rigSilhouetteAsset(this.chapter);
    if (asset && this.textureReady(asset.id)) {
      const targetH = 170; // matches the procedural mast+derrick's vertical extent below
      const src = this.textures.get(asset.id).getSourceImage() as { height: number };
      const img = this.add.image(cx, baseY, asset.id).setOrigin(0.5, 1);
      img.setScale(targetH / src.height);
      this.rig.add(img);
      return;
    }
    const g = this.add.graphics();
    g.fillStyle(0x1c2740, 1);
    g.fillRect(cx - 10, baseY - 140, 20, 140); // derrick mast
    g.fillTriangle(cx - 60, baseY, cx + 60, baseY, cx, baseY - 160);
    g.lineStyle(3, theme.accent, 0.9);
    g.strokeTriangle(cx - 60, baseY, cx + 60, baseY, cx, baseY - 160);
    g.fillStyle(theme.accent, 1);
    g.fillCircle(cx, baseY - 160, 6); // beacon
    this.rig.add(g);
  }

  private drawWells(): void {
    if (!this.wellField) return;
    this.wellField.removeAll(true);
    const { width, height } = this.scale;
    const visible = this.wells.slice(0, MAX_VISIBLE_WELLS);
    const spacing = Math.min(90, (width - 120) / Math.max(1, visible.length));
    const startX = width / 2 - (spacing * (visible.length - 1)) / 2;
    const baseY = height * 0.86;
    const theme = chapterTheme(this.chapter);

    visible.forEach((well, i) => {
      const h = 18 + Math.max(0, Math.min(1, well.relativeSize)) * 46;
      const size: 'small' | 'large' = well.relativeSize >= 0.5 ? 'large' : 'small';
      const asset = wellAsset(this.chapter, size, well.active);
      const x = startX + i * spacing;
      let obj: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
      if (asset && this.textureReady(asset.id)) {
        const src = this.textures.get(asset.id).getSourceImage() as { height: number };
        const img = this.add.image(0, 0, asset.id).setOrigin(0.5, 1);
        img.setScale(h / src.height);
        if (!well.active) img.setAlpha(0.55);
        img.setInteractive();
        obj = img;
      } else {
        const g = this.add.graphics();
        const color = well.active ? theme.accent : 0x4a5568;
        g.fillStyle(color, well.active ? 0.9 : 0.5);
        g.fillRoundedRect(-6, -h, 12, h, 3);
        g.setInteractive(new Phaser.Geom.Rectangle(-10, -h, 20, h), Phaser.Geom.Rectangle.Contains);
        obj = g;
      }
      obj.setPosition(x, baseY);
      obj.setName(this.wellObjectName(well.positionId));
      obj.on('pointerup', () => this.onWellClick?.(well.positionId));
      this.wellField?.add(obj);
    });
  }

  private drawCrew(): void {
    if (!this.crewField) return;
    this.crewField.removeAll(true);
    const { width, height } = this.scale;
    const ids = Object.keys(this.crewState);
    const spacing = Math.min(50, 220 / Math.max(1, ids.length));
    const startX = width / 2 - 110;
    const y = height * 0.72;
    ids.forEach((id, i) => {
      const state = this.crewState[id];
      const asset = crewIdleSpriteAsset(id as CrewId);
      const x = startX + i * spacing;
      let obj: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
      if (asset && this.textureReady(asset.id)) {
        const targetH = 46;
        const src = this.textures.get(asset.id).getSourceImage() as { height: number };
        const img = this.add.image(0, 0, asset.id).setOrigin(0.5, 1);
        img.setScale(targetH / src.height);
        img.setAlpha(state === 'idle_empty' ? 0.5 : 1);
        obj = img;
      } else {
        const g = this.add.graphics();
        g.fillStyle(this.crewColor(state), 1);
        g.fillCircle(0, 0, 9);
        obj = g;
      }
      obj.setPosition(x, y);
      obj.setName(id);
      this.crewField?.add(obj);
    });
  }

  private crewColor(state: CrewState | undefined): number {
    switch (state) {
      case 'working': return 0x528dff;
      case 'waiting': return 0xd6a24b;
      case 'idle_empty': return 0x4a5568;
      case 'chapter_up': return 0x9fe6d0;
      default: return 0x8c90a0;
    }
  }

  private startIdleBob(): void {
    if (!this.crewField) return;
    // Budget: rig(1) + up to 6 wells(static, no tween) + up to 5 crew ≤ 6
    // concurrently tweened elements — well inside the ≤24 element budget
    // (05 §3.1).
    const children = this.crewField.list as (Phaser.GameObjects.Image | Phaser.GameObjects.Graphics)[];
    children.forEach((child, i) => {
      const tween = this.tweens.add({
        targets: child,
        y: child.y - 3,
        duration: 900 + (i % 3) * 120,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.activeTweens.push(tween);
    });
  }

  /** One-shot lift burst (05 §3.3) — flash + settle, capped at one at a time, skipped under reduced motion. */
  playLiftBurst(): void {
    if (this.motionReduced || !this.rig) return;
    const { width, height } = this.scale;
    const flash = this.add.circle(width / 2, height * 0.6, 4, 0xffffff, 0.9).setDepth(5);
    this.tweens.add({
      targets: flash,
      radius: 60,
      alpha: 0,
      duration: 900,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    });
  }

  /** Chapter transition (05 §4.3) — background crossfade only, no full-screen cutscene. */
  crossfadeToChapter(chapter: number): void {
    if (!this.bgLayerA || !this.bgLayerB) return;
    this.chapter = chapter;
    this.ensureChapterAssetsLoaded(chapter, () => {
      if (!this.bgLayerA || !this.bgLayerB) return; // scene may have torn down while assets were loading
      this.drawBackground(this.bgLayerB, chapter);
      this.drawRig();
      this.drawWells();
      if (this.motionReduced) {
        this.bgLayerA.setAlpha(0);
        this.bgLayerB.setAlpha(1);
        [this.bgLayerA, this.bgLayerB] = [this.bgLayerB, this.bgLayerA];
        return;
      }
      this.tweens.add({
        targets: this.bgLayerB,
        alpha: 1,
        duration: CHAPTER_CROSSFADE_MS,
        onComplete: () => {
          if (!this.bgLayerA || !this.bgLayerB) return;
          this.bgLayerA.setAlpha(0);
          [this.bgLayerA, this.bgLayerB] = [this.bgLayerB, this.bgLayerA];
        },
      });
    });
  }

  setWells(wells: DeepCoreWellView[]): void {
    this.wells = wells;
    this.drawWells();
  }

  private wellObjectName(positionId: string): string {
    return `well-${positionId}`;
  }

  /** staking-page-v2-screen-flow-frd.md CH-2 / UF-5 — pans the camera to and
   * pulses a highlight ring on the well matching `positionId`, replacing
   * the pre-v2 `scrollIntoView` round-trip between the canvas and the
   * position list (now a sheet). `null` just clears any active focus
   * (camera + ring), which is also what runs first on every call so a new
   * focus target never stacks on top of a stale one. No-op (beyond the
   * clear) if the well isn't among the currently-rendered ones — e.g.
   * beyond `MAX_VISIBLE_WELLS` — rather than throwing. R-4: this is a pure
   * visual cue, no text is drawn. */
  focusWell(positionId: string | null): void {
    this.clearWellFocus();
    if (!positionId || !this.wellField) return;
    const target = this.wellField.list.find(
      (obj) => (obj as Phaser.GameObjects.Image | Phaser.GameObjects.Graphics).name === this.wellObjectName(positionId),
    ) as (Phaser.GameObjects.Image | Phaser.GameObjects.Graphics) | undefined;
    if (!target) return;

    const { width, height } = this.scale;
    if (!this.motionReduced) {
      this.cameras.main.pan(target.x, height / 2, 350, 'Sine.easeInOut');
      this.cameras.main.zoomTo(1.15, 350);
    }

    this.focusRing = this.add.circle(target.x, target.y - 10, 4, 0xffffff, 0).setDepth(7);
    this.focusRing.setStrokeStyle(2, 0x9fe6d0, 0.95);
    this.tweens.add({
      targets: this.focusRing,
      radius: 26,
      alpha: { from: 0.95, to: 0 },
      duration: 900,
      repeat: this.motionReduced ? 0 : 1,
      onComplete: () => { this.focusRing?.destroy(); this.focusRing = undefined; },
    });

    this.focusResetEvent = this.time.delayedCall(2000, () => {
      if (!this.motionReduced) {
        this.cameras.main.pan(width / 2, height / 2, 350, 'Sine.easeInOut');
        this.cameras.main.zoomTo(1, 350);
      }
    });
  }

  private clearWellFocus(): void {
    this.focusRing?.destroy();
    this.focusRing = undefined;
    if (this.focusResetEvent) this.time.removeEvent(this.focusResetEvent);
    this.focusResetEvent = undefined;
  }

  setCrewState(crew: Record<string, CrewState>): void {
    this.crewState = crew;
    const missing = Object.keys(crew)
      .map((id) => crewIdleSpriteAsset(id as CrewId))
      .filter((a): a is DeepCoreAsset => a != null && !this.textures.exists(a.id) && !this.failedTextureKeys.has(a.id));
    const redraw = () => {
      this.drawCrew();
      if (!this.motionReduced) this.startIdleBob();
    };
    if (missing.length === 0) { redraw(); return; }
    missing.forEach((a) => this.queueImage(a.id, a.publicPath));
    this.load.once(Phaser.Loader.Events.COMPLETE, redraw);
    this.load.start();
  }

  shutdown(): void {
    this.activeTweens.forEach((t) => t.stop());
    this.activeTweens = [];
    this.clearWellFocus();
    this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR);
    this.load.off(Phaser.Loader.Events.COMPLETE);
  }
}
