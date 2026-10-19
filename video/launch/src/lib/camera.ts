// The anchor camera: one transform on one world container. A shot says "world point (ax, ay)
// sits at screen point (sx, sy) at scale k", which is how a director thinks about framing, and
// shots chain without drift: lc(lc(A, B, t1), C, t2). Anchors lerp linearly, k in log space.
import type React from 'react';
import { f60 } from '../timeline';
import { clamp, lmix, mix } from './anim';

export type Shot = {
  ax: number; // world point that is framed ...
  ay: number;
  sx: number; // ... at this screen point
  sy: number;
  k: number; // scale (world px -> screen px)
  yaw?: number; // deg, rotateY: each act gets its own axis
  pitch?: number; // deg, rotateX (tilt)
  roll?: number; // deg, rotateZ: rigid in screen space, keep <= 11
};

/** Blend two shots. Scale in log space so a zoom has constant perceived speed. */
export const lc = (A: Shot, B: Shot, t: number): Shot => ({
  ax: mix(A.ax, B.ax, t),
  ay: mix(A.ay, B.ay, t),
  sx: mix(A.sx, B.sx, t),
  sy: mix(A.sy, B.sy, t),
  k: lmix(A.k, B.k, t),
  yaw: mix(A.yaw ?? 0, B.yaw ?? 0, t),
  pitch: mix(A.pitch ?? 0, B.pitch ?? 0, t),
  roll: mix(A.roll ?? 0, B.roll ?? 0, t),
});

/**
 * Style for the world container (lay the world out at left:0, top:0 in world px). All translation
 * lives inside this one matrix: fractional left/top next to a transform snaps to whole pixels and
 * slow drifts stair-step. Roll sits outside the tilt so type is never sheared into faux italics.
 */
export const camera = (s: Shot, perspective = 2400): React.CSSProperties => {
  const rot =
    s.yaw || s.pitch || s.roll
      ? ` perspective(${perspective}px) rotateZ(${s.roll ?? 0}deg) rotateX(${s.pitch ?? 0}deg) rotateY(${s.yaw ?? 0}deg)`
      : '';
  return {
    position: 'absolute',
    left: 0,
    top: 0,
    transformOrigin: '0 0',
    transform: `translate(${s.sx}px, ${s.sy}px)${rot} scale(${Math.max(1e-4, s.k)}) translate(${-s.ax}px, ${-s.ay}px)`,
  };
};

/**
 * Screen position of a world point under a flat shot (no yaw/pitch/roll): where to draw an overlay
 * that tracks the product (a cursor, the story device, a caption pinned to a row), every frame.
 */
export const toScreen = (s: Shot, p: { x: number; y: number }) => ({
  x: s.sx + (p.x - s.ax) * s.k,
  y: s.sy + (p.y - s.ay) * s.k,
});

/** Push-in "breath" inside a hold: multiply k by it (amount 0.025 = +2.5%). Released by the next move. */
export const breath = (t: number, amount = 0.025) => 1 + amount * t;

/** Zoom-out hop during a whip (t = the whip's 0..1 progress): multiply k by it. */
export const dip = (t: number, depth = 0.18) => 1 - depth * Math.sin(Math.PI * t) ** 2;

/** Log-scale speed of a zoom (ln k per frame) from frame f - 1 to f. At a cut: zoomSpeed(kOut, cut - 1). */
export const zoomSpeed = (k: (f: number) => number, f: number) => Math.log(Math.max(1e-6, k(f)) / Math.max(1e-6, k(f - 1)));

/**
 * Velocity handoff for a zoom-through cut: the incoming shot keeps zooming at the outgoing move's
 * log-scale speed `v0` (zoomSpeed at the cut), then decays exponentially (time constant settle/5,
 * expo-out-like) to rest exactly at `settle` frames with zero velocity. A cut at peak speed then
 * reads as one move; an incoming shot that starts at rest reads as a stall at the cut. Multiply the
 * incoming shot's k by `.k` at t = frames since the cut (0 on its first frame); `.from` is where it
 * starts (= exp(-0.193·v0·settle)), so lengthen `settle` for a bigger entry, shorten it for less.
 * Defaults at 60 fps: settle 30 f. An exit of 1 -> 1.2 on E.in over 12 f, cut on its 12th frame
 * (v0 = 0.047), starts the entry at 0.76x: the 0.75 -> 1 entry of references/transitions.md §4.8,
 * with no speed step at the cut.
 */
export const zoomHandoff = (t: number, v0: number, settle = f60(30)) => {
  const T = Math.max(1, settle);
  const a = 5; // window length in time constants
  const tau = T / a;
  const ea = Math.exp(-a);
  const s = clamp(t / T);
  // exponential decay minus its tangent at T, so position and velocity both reach 0 at t = T
  const u = (-v0 * tau * (Math.exp(-a * s) - ea * (1 + a - a * s))) / (1 - ea);
  const v = (v0 * (Math.exp(-a * s) - ea)) / (1 - ea);
  const u0 = (-v0 * tau * (1 - ea * (1 + a))) / (1 - ea);
  return { k: Math.exp(u), v: t >= T ? 0 : v, from: Math.exp(u0) };
};
