// Sync points computed from the picture's own curves, never typed by hand. src/sync.ts calls these
// to place sounds; acts call them to make a visible moment land ON a beat. Node-safe (no DOM).
import { spring } from 'remotion';
import { FPS } from '../timeline';
import type { Ease, Spr } from './anim';

const STEPS = 400;

/** Frame of peak velocity of a tween from frame a to b with `ease` (where a whoosh's apex goes). */
export const peak = (a: number, b: number, ease: Ease): number => {
  let best = a;
  let bestV = -Infinity;
  for (let i = 0; i < STEPS; i++) {
    const t = i / STEPS;
    const v = Math.abs(ease(Math.min(1, t + 1 / STEPS)) - ease(t));
    if (v > bestV) {
      bestV = v;
      best = a + (t + 0.5 / STEPS) * (b - a);
    }
  }
  return Math.round(best);
};

/** Frames after its start until a spring first reaches `thr` of its travel (0.5 = pop, 1 = contact). */
export const delayTo = (cfg: Spr, thr = 1): number => {
  // 5e-4 tolerance: an overdamped spring approaches 1 without ever reaching it exactly.
  for (let f = 0; f < FPS * 4; f++) if (spring({ frame: f, fps: FPS, config: cfg }) >= thr - 5e-4) return f;
  throw new Error(`delayTo: spring never reached ${thr} within 4 s (${JSON.stringify(cfg)})`);
};

/** Absolute frame a spring started at `start` first reaches `thr` (1 = contact for impacts, 0.92 for soft snaps). */
export const hit = (start: number, cfg: Spr, thr = 1): number => start + delayTo(cfg, thr);

/** First frame an eased tween from a to b reaches `thr` of its travel (0.97 = where a settle sound goes). */
export const settleOf = (a: number, b: number, ease: Ease, thr = 0.97): number => {
  for (let f = Math.ceil(a); f < b; f++) if (ease((f - a) / (b - a)) >= thr) return f;
  return Math.ceil(b);
};
