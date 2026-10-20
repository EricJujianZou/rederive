// Safe zones: where text and the key action must stay, per destination. Node-safe (no React, no
// DOM), so acts (layout tables), the layout audit (lib/Audit.tsx) and scripts can all import it.
// Numbers are px at each preset's base size and scale with the frame; they are the proven
// defaults in references/formats.md §7 (check the destination's current overlays when it matters).

/** Margins from each edge, px. */
export type Insets = { top: number; right: number; bottom: number; left: number };

export const SAFE_PRESETS = {
  /** 16:9 players and landing pages: 96 px at the sides, 64 px top and bottom. */
  wide16x9: { w: 1920, h: 1080, top: 64, right: 96, bottom: 64, left: 96 },
  /** Full-screen vertical feeds: header and tabs above, the action rail on the right, handle and a 1-2 line caption below. */
  feed9x16: { w: 1080, h: 1920, top: 270, right: 120, bottom: 420, left: 64 },
  /** Vertical feeds at their strictest: long captions or a paid post's call-to-action button (bottom 35%). */
  feed9x16Strict: { w: 1080, h: 1920, top: 288, right: 192, bottom: 672, left: 64 },
  /** 4:5 feed posts. */
  portrait4x5: { w: 1080, h: 1350, top: 96, right: 64, bottom: 96, left: 64 },
  /** 1:1 feed posts. */
  square1x1: { w: 1080, h: 1080, top: 64, right: 64, bottom: 64, left: 64 },
} as const;

export type SafePreset = keyof typeof SAFE_PRESETS | 'title';
/** A preset name, explicit insets, or the older symmetric {x, y} (x at both sides, y top and bottom). */
export type SafeSpec = SafePreset | Insets | { x: number; y: number };

/** Plain title-safe margins: 5% at the sides, 6% top and bottom (96 x 65 px at 1920x1080). */
const title = (w: number, h: number): Insets => {
  const x = Math.round(w * 0.05);
  const y = Math.round(h * 0.06);
  return { top: y, right: x, bottom: y, left: x };
};

/** The preset whose aspect matches the frame (within 2%), else 'title'. 9:16 defaults to the feed zones. */
export const presetFor = (w: number, h: number): SafePreset => {
  const hit = (Object.keys(SAFE_PRESETS) as (keyof typeof SAFE_PRESETS)[]).find((k) => {
    const p = SAFE_PRESETS[k];
    return Math.abs(w / h / (p.w / p.h) - 1) < 0.02;
  });
  return hit ?? 'title';
};

/** Resolve a spec to insets for a w x h frame. No spec: the preset for the frame's aspect (presetFor). */
export const safeInsets = (spec: SafeSpec | undefined, w: number, h: number): Insets => {
  const s = spec ?? presetFor(w, h);
  if (typeof s === 'string') {
    if (s === 'title') return title(w, h);
    const p = (SAFE_PRESETS as Record<string, (typeof SAFE_PRESETS)[keyof typeof SAFE_PRESETS]>)[s];
    if (!p) throw new Error(`safe: unknown preset "${s}" (use ${['title', ...Object.keys(SAFE_PRESETS)].join(', ')})`);
    const kx = w / p.w;
    const ky = h / p.h;
    return { top: Math.round(p.top * ky), right: Math.round(p.right * kx), bottom: Math.round(p.bottom * ky), left: Math.round(p.left * kx) };
  }
  if ('x' in s && 'y' in s) return { top: s.y, right: s.x, bottom: s.y, left: s.x };
  const ins = s as Insets;
  for (const k of ['top', 'right', 'bottom', 'left'] as const)
    if (!(typeof ins[k] === 'number' && ins[k] >= 0)) throw new Error(`safe: ${k} must be a number >= 0 (got ${JSON.stringify(s)})`);
  return { top: ins.top, right: ins.right, bottom: ins.bottom, left: ins.left };
};

/**
 * The safe box itself, for layout tables: its edges, size and centre. In a tall frame, centre the
 * content's visual mass on (cx, cy), the middle of the band the feed leaves clear, not on H / 2.
 */
export const safeBox = (spec: SafeSpec | undefined, w: number, h: number) => {
  const i = safeInsets(spec, w, h);
  const bw = w - i.left - i.right;
  const bh = h - i.top - i.bottom;
  return { ...i, x: i.left, y: i.top, w: bw, h: bh, cx: i.left + bw / 2, cy: i.top + bh / 2 };
};
