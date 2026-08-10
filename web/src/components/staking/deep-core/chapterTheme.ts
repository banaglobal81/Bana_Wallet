// DEEP CORE — chapter palette direction (docs/specs/deep-core-01-world-bible.md §6.2).
// Used by the Phaser scene for placeholder art (before game-designer's real
// assets land) and kept inside this tree per G-3 (game surface isolation).
export interface ChapterTheme {
  /** sky (far background) hex */
  sky: number;
  /** mid layer hex */
  mid: number;
  /** foreground hex */
  fore: number;
  /** accent used for rig/well markers */
  accent: number;
}

// Chapter 1 is the sole intentionally-bright exception (01 §6.2); chapters
// 3/6 lean into the host page's existing navy so the canvas reads as a guest,
// not a takeover (M-6 — bg contrast must never crowd out real numbers).
export const CHAPTER_THEMES: Readonly<Record<number, ChapterTheme>> = Object.freeze({
  1: { sky: 0xe8d9b5, mid: 0xd9b876, fore: 0xb98f4a, accent: 0xff9d4d }, // sand/ochre, sun
  2: { sky: 0xe0955a, mid: 0xb5642f, fore: 0x7a3f22, accent: 0xffab5e }, // amber sunset
  3: { sky: 0x121a2c, mid: 0x0d1424, fore: 0x06132a, accent: 0x9fb4ff }, // black basalt, white artificial light
  4: { sky: 0x3a1414, mid: 0x271012, fore: 0x140a0c, accent: 0xff6a4d }, // steam-red geothermal
  5: { sky: 0x0d2e34, mid: 0x0a2228, fore: 0x06132a, accent: 0x4de0c8 }, // crystal teal glow
  6: { sky: 0x06132a, mid: 0x0a1a38, fore: 0x112643, accent: 0x528dff }, // full return to the host navy
});

export function chapterTheme(chapter: number): ChapterTheme {
  return CHAPTER_THEMES[Math.min(6, Math.max(1, chapter))] ?? CHAPTER_THEMES[1];
}
