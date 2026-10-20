// Temporal motion blur, the way a film camera makes it: an output frame is the average of n renders
// spread across a 240-degree shutter centred on the frame's time. n comes from how fast things move
// on screen in that frame (scripts/measure-speed.py, optical flow on the sharp render), so fast moves
// smear and still frames render once. The averaging happens outside the browser, in float
// (scripts/accumulate.py); compositing samples in Chromium quantises each one to 8 bits and rings.
// Sampling never crosses an act boundary, so designed cuts stay crisp. A frame too fast for its
// samples gets a shorter shutter from measure-speed.py (`shutters`), so the samples stay a few px
// apart and draw one clean, shorter streak instead of stepped copies.
import { ACT, TOTAL } from './timeline';

export const SHUTTER = 240; // degrees; scripts/measure-speed.py assumes the same

const ACTS = Object.values(ACT);

/** The n sub-frame times that make up output frame f (clamped inside f's act), across `shutter` degrees. */
export const sampleTimes = (f: number, n: number, shutter = SHUTTER): number[] => {
  if (n <= 1) return [f];
  const a = ACTS.find((x) => f >= x.from && f < x.from + x.dur) ?? { from: 0, dur: TOTAL };
  const span = shutter / 360;
  const lo = a.from;
  const hi = a.from + a.dur - 1e-3;
  return Array.from({ length: n }, (_, i) => Math.min(hi, Math.max(lo, f + span * ((i + 0.5) / n - 0.5))));
};

export type SubFrame = { f: number; t: number };

/**
 * Every sub-frame of the blurred master in order, for per-frame sample counts `groups` (missing = 1)
 * and optional per-frame shutter angles `shutters` (missing = SHUTTER).
 */
export const subframes = (groups: number[], shutters: number[] = []): SubFrame[] => {
  const out: SubFrame[] = [];
  for (let f = 0; f < TOTAL; f++) for (const t of sampleTimes(f, groups[f] ?? 1, shutters[f] ?? SHUTTER)) out.push({ f, t });
  return out;
};
