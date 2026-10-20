import React from 'react';
import { clamp, E, Ease, mix, prog, Spr, spr } from '../lib/anim';
import { mixColor } from '../lib/color';
import { f60 } from '../timeline';

/** One state of the container, in the parent's px. Shadow: black, `a` alpha (0.12-0.22 reads as a real surface). */
export type MorphBox = {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number; // corner radius; a pill is h / 2
  fill?: string; // a hex token
  stroke?: string; // a hex token
  strokeW?: number;
  shadow?: { y: number; blur: number; a: number };
};

/**
 * The box between A and B at progress p. Sizes are clamped >= 0 and the radius to [0, min(w, h)/2],
 * so a spring that overshoots can never hand Chromium a negative radius (references/chromium-rendering.md §5).
 */
export const morphBox = (A: MorphBox, B: MorphBox, p: number): Required<MorphBox> => {
  const w = Math.max(0, mix(A.w, B.w, p));
  const h = Math.max(0, mix(A.h, B.h, p));
  const q = clamp(p);
  const sa = A.shadow ?? { y: 0, blur: 0, a: 0 };
  const sb = B.shadow ?? { y: 0, blur: 0, a: 0 };
  const fill = A.fill && B.fill ? mixColor(A.fill, B.fill, q) : (B.fill ?? A.fill ?? 'transparent');
  const stroke = A.stroke && B.stroke ? mixColor(A.stroke, B.stroke, q) : (B.stroke ?? A.stroke ?? 'transparent');
  return {
    x: mix(A.x, B.x, p),
    y: mix(A.y, B.y, p),
    w,
    h,
    r: clamp(mix(A.r, B.r, p), 0, Math.min(w, h) / 2),
    fill,
    stroke,
    strokeW: Math.max(0, mix(A.strokeW ?? 0, B.strokeW ?? 0, q)),
    shadow: { y: mix(sa.y, sb.y, q), blur: Math.max(0, mix(sa.blur, sb.blur, q)), a: clamp(mix(sa.a, sb.a, q)) },
  };
};

/**
 * Container morph: one rounded rect travels from state A to state B (x, y, w, h, radius, fill,
 * stroke and shadow together) on one progress, for pill -> card, button -> panel, caret -> pill.
 * Content A fades out over the first 35% and content B fades in over the last 40% (E.smooth), so
 * the container is empty while it moves fastest and no frame shows both at full strength (a
 * crossfade of two layouts reads as a double exposure). Content keeps its own size (text is never
 * scaled) and stays where its own state puts it, laid out in that state's box and revealed or
 * hidden by the moving, clipping rounded box (the shared-element mask of references/transitions.md
 * §4.2). Content that rode with the box would cross the slow ends of the move and settle in 1 px
 * vertical ticks (references/chromium-rendering.md §15). Defaults at 60 fps: 40 f on E.inOut,
 * timed by the clock; pass `spring` (SPR.firm) to drive geometry and fades by the spring instead
 * (not an overshooting one when the box shrinks: it clamps at 0 and vanishes for the overshoot).
 * Placed by transform only (left: 0; top: 0);
 * width, height and radius are real sizes, so the radius and stroke never distort the way a
 * scaled box would. The stroke draws above the content, so content at the edge never covers it.
 */
export const Morph: React.FC<{
  frame: number; // local frame
  start: number;
  A: MorphBox;
  B: MorphBox;
  a?: React.ReactNode; // content of state A, laid out in an A.w x A.h box
  b?: React.ReactNode; // content of state B, laid out in a B.w x B.h box
  dur?: number;
  ease?: Ease;
  spring?: Spr;
  style?: React.CSSProperties;
}> = ({ frame, start, A, B, a, b, dur = f60(40), ease = E.inOut, spring, style }) => {
  const p = spring ? spr(frame, start, spring) : prog(frame, start, start + dur, ease);
  const u = spring ? clamp(p) : clamp((frame - start) / Math.max(1, dur)); // the content's clock
  const m = morphBox(A, B, p);
  const outA = 1 - prog(u, 0, 0.35, E.smooth);
  const inB = prog(u, 0.6, 1, E.smooth);
  // content at its own state's place in the parent, so it never moves while the box does
  const place = (S: MorphBox) => `translate(${(S.x - m.x).toFixed(3)}px, ${(S.y - m.y).toFixed(3)}px)`;
  const box: React.CSSProperties = { position: 'absolute', left: 0, top: 0, width: m.w, height: m.h, borderRadius: m.r };
  const sh = m.shadow;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${m.x.toFixed(3)}px, ${m.y.toFixed(3)}px)`, ...style }}>
      <div
        style={{
          ...box,
          overflow: 'hidden',
          background: m.fill,
          boxShadow: sh.a > 0.001 ? `0 ${sh.y.toFixed(2)}px ${sh.blur.toFixed(2)}px rgba(0,0,0,${sh.a.toFixed(3)})` : undefined,
        }}
      >
        {a !== undefined && outA > 0.001 && (
          <div style={{ position: 'absolute', left: 0, top: 0, width: A.w, height: A.h, opacity: outA, transform: place(A) }}>{a}</div>
        )}
        {b !== undefined && inB > 0.001 && (
          <div style={{ position: 'absolute', left: 0, top: 0, width: B.w, height: B.h, opacity: inB, transform: place(B) }}>{b}</div>
        )}
      </div>
      {m.strokeW > 0.01 && <div style={{ ...box, boxShadow: `inset 0 0 0 ${m.strokeW.toFixed(2)}px ${m.stroke}` }} />}
    </div>
  );
};
