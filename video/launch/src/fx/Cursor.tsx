import React from 'react';
import { C } from '../brand/tokens';
import { mix } from '../lib/anim';

/**
 * System-style arrow pointer, placed ONLY by transform (tip at x, y). A fractional left/top next to
 * a transform snaps to whole pixels, so a slow cursor would stair-step. Use no cursor at all once
 * the product acts on its own.
 */
export const Cursor: React.FC<{ x: number; y: number; scale?: number; press?: number; opacity?: number }> = ({ x, y, scale = 1, press = 0, opacity = 1 }) => (
  <div
    style={{
      position: 'absolute',
      left: 0,
      top: 0,
      opacity,
      transformOrigin: '0 0',
      transform: `translate(${x}px, ${y}px) scale(${scale * (1 - 0.12 * press)})`,
      filter: 'drop-shadow(0 3px 5px rgba(0,0,0,0.28))',
    }}
  >
    <svg width={30} height={42} viewBox="0 0 30 42" style={{ position: 'absolute', left: -3, top: -2 }}>
      <path d="M3 2 L3 33 L10.2 26.4 L15 38 L20.2 35.8 L15.4 24.4 L25 24.4 Z" fill={C.ink} stroke={C.white} strokeWidth={2.4} strokeLinejoin="round" />
    </svg>
  </div>
);

type Pt = { x: number; y: number };

/**
 * Point on a bowed path from a to b at eased progress t (0..1). Hands never move in straight
 * lines: the control point sits `bow` of the path length off the chord (0.15-0.25 reads human).
 */
export const cursorArc = (a: Pt, b: Pt, t: number, bow = 0.2): Pt => {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const cx = mx - dy * bow; // perpendicular offset (bows to the left of travel; negate bow to flip)
  const cy = my + dx * bow;
  return { x: mix(mix(a.x, cx, t), mix(cx, b.x, t), t), y: mix(mix(a.y, cy, t), mix(cy, b.y, t), t) };
};

/** Click press 0..1 for Cursor's `press` prop: down over 4 f from `at`, recoil over the next 8 f. */
export const pressAt = (frame: number, at: number) => {
  const t = frame - at;
  if (t <= 0 || t >= 12) return 0;
  return t < 4 ? t / 4 : 1 - (t - 4) / 8;
};
