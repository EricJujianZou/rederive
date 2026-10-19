import React from 'react';
import { C } from './tokens';

// cinetic:placeholder - delete these three lines once the mark is the film's own. This is the
// starter's stand-in: build the film's mark (or place the user's logo) per
// references/brand-and-color.md; lint-film.mjs errors while a placeholder marker is left in src/.
//
// The placeholder mark: three primitives on a 100-unit box, every gap >= 8 units so it still
// reads at 16 px. A dome (A) over a block (B) and the accent dot (D) - the dot is the film's
// story device, which is why it is its own piece. Replace the geometry, keep the contract:
// named pieces, per-piece transforms, geometry exported for the acts to place things by.
export const MARK = {
  A: { d: 'M0 50 A50 50 0 0 1 100 50 Z', cx: 50, cy: 25, w: 100, h: 50 }, // dome: the signature curve
  B: { x: 0, y: 58, w: 46, h: 42, r: 3 }, // block: crisp corners against the curves
  D: { cx: 77, cy: 79, r: 21 }, // dot: the accent
};

export type Piece = 'A' | 'B' | 'D';

/** Per-piece pose in mark units. `origin` defaults to the piece centre; set it to an edge to squash against it. */
export type PieceXf = { x?: number; y?: number; rot?: number; s?: number; sx?: number; sy?: number; o?: number; origin?: [number, number] };

const xf = (p: PieceXf | undefined, cx: number, cy: number) => {
  if (!p) return undefined;
  const [ox, oy] = p.origin ?? [cx, cy];
  // Clamp scales at 0: overshoot must never feed a negative value into SVG geometry.
  const sx = Math.max(0, (p.s ?? 1) * (p.sx ?? 1));
  const sy = Math.max(0, (p.s ?? 1) * (p.sy ?? 1));
  return `translate(${p.x ?? 0} ${p.y ?? 0}) rotate(${p.rot ?? 0} ${ox} ${oy}) translate(${ox} ${oy}) scale(${sx} ${sy}) translate(${-ox} ${-oy})`;
};

export const Mark: React.FC<{
  size: number; // px on screen for the 100-unit box
  ink?: string;
  dot?: string;
  a?: PieceXf;
  b?: PieceXf;
  d?: PieceXf;
  only?: Piece[]; // draw a subset: the dot alone is the story device before the mark exists
  style?: React.CSSProperties;
}> = ({ size, ink = C.ink, dot = C.accent, a, b, d, only, style }) => {
  const { A, B, D } = MARK;
  const show = (p: Piece) => !only || only.includes(p);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow: 'visible', display: 'block', ...style }}>
      {show('A') && <path d={A.d} fill={ink} transform={xf(a, A.cx, A.cy)} opacity={a?.o ?? 1} />}
      {show('B') && <rect x={B.x} y={B.y} width={B.w} height={B.h} rx={B.r} fill={ink} transform={xf(b, B.x + B.w / 2, B.y + B.h / 2)} opacity={b?.o ?? 1} />}
      {show('D') && <circle cx={D.cx} cy={D.cy} r={D.r} fill={dot} transform={xf(d, D.cx, D.cy)} opacity={d?.o ?? 1} />}
    </svg>
  );
};

/**
 * Transform that places a Mark rendered at `size` so its box's top-left sits at (x, y) scaled by k.
 * Scale the whole SVG by transform instead of changing `size` per frame: no relayout, no pixel snapping.
 */
export const placeMark = (x: number, y: number, k = 1): React.CSSProperties => ({
  position: 'absolute',
  left: 0,
  top: 0,
  transformOrigin: '0 0',
  transform: `translate(${x}px, ${y}px) scale(${Math.max(1e-4, k)})`,
});
