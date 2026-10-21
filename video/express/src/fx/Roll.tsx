import React from 'react';
import { FONT, TYPE, U, typeStyle } from '../brand/tokens';
import { arrive, arriveK, clamp, E, Ease, fd, mix, prog } from '../lib/anim';
import { f60 } from '../timeline';

type Role = keyof typeof TYPE;

/** The value shown from whole frame `at` on. */
export type RollStep = { at: number; value: number };

/**
 * Steps of a count from a to b over [start, start + dur] on `ease`: one step on every whole frame
 * where the shown integer changes, so a fast stretch ticks every frame and the tail slows down.
 * The step frames are integers: put ticks on them (thin them first if they come every frame).
 */
export const countSteps = (a: number, b: number, start: number, dur: number, ease: Ease = E.out): RollStep[] => {
  const out: RollStep[] = [];
  let last = Math.round(a);
  for (let F = Math.ceil(start); F <= Math.ceil(start + dur); F++) {
    const v = Math.round(mix(a, b, prog(F, start, start + dur, ease)));
    if (v !== last) out.push({ at: F, value: (last = v) });
  }
  return out;
};

type Slot = { s: number; d: number; at: number }; // strip position, digit (-1 blank), frame it rolls in

/**
 * Rolling digits. Each digit column is a strip inside its own mask (overflow clip, one line tall):
 * when a step changes that column's digit, the strip slides one slot on E.out over `roll` frames,
 * the new digit rising from below as the value grows and dropping from above as it shrinks. Columns
 * that did not change hold still. Steps closer than `roll` overlap and add up, so a fast count
 * (countSteps) spins the low columns at up to one slot per frame and lands each on its own E.out:
 * an odometer, never two numbers crossfaded in place. Defaults at 60 fps: roll 14 f, the slide
 * starting one frame before its step (already moving on the step frame) and ending through
 * arrive() at arriveK(), because vertical text snaps to whole pixels and an ease-out tail would
 * tick (references/chromium-rendering.md §15): a display digit is home after ~9 f, stopping from
 * ~1 px/f. Digits are tabular and the column count is fixed (`digits`, default the widest value;
 * leading columns blank unless `pad`), so the box never changes width. `group` (e.g. ',')
 * separates thousands, fading with the column to its left. Integers >= 0. A step that reverses
 * direction before the previous slide has landed (~9 f) swaps the digit still leaving that slot
 * for the incoming one; space reversals about `roll` frames apart.
 * Pass `steps` (event counters: references/product-ui.md §4.2) or `to` with `start` and `dur`.
 */
export const Roll: React.FC<{
  frame: number; // local frame
  from: number; // the value before the first step
  steps?: RollStep[];
  to?: number; // count mode: from -> to over [start, start + dur] on `ease`
  start?: number;
  dur?: number;
  ease?: Ease;
  roll?: number;
  digits?: number;
  pad?: boolean;
  group?: string;
  id?: string; // data-text id for the layout audit
  role?: Role;
  size?: number;
  family?: string;
  lead?: number; // mask height and slot pitch, em
  style?: React.CSSProperties;
}> = ({ frame, from, steps, to, start = 0, dur = f60(60), ease = E.out, roll = f60(14), digits, pad = false, group, id = 'roll', role = 'display', size = TYPE[role].size * U, family = FONT.text, lead = 1.2, style }) => {
  const seq = steps ?? (to === undefined ? [] : countSteps(from, to, start, dur, ease));
  const values = [Math.max(0, Math.round(from)), ...seq.map((x) => Math.max(0, Math.round(x.value)))];
  const D = digits ?? Math.max(...values.map((v) => String(v).length));
  const digitOf = (v: number, c: number) => {
    const p = 10 ** (D - 1 - c);
    return pad || p === 1 || v >= p ? Math.floor(v / p) % 10 : -1;
  };
  const k = arriveK(lead * size, roll, E.out);
  const move = (at: number) => arrive(prog(frame, at - 1, at - 1 + roll, E.out), k);

  const cols = Array.from({ length: D }, (_, c) => {
    const slots: Slot[] = [{ s: 0, d: digitOf(values[0], c), at: -Infinity }];
    let pos = 0;
    for (let e = 1; e < values.length; e++) {
      const d = digitOf(values[e], c);
      if (d === slots[slots.length - 1].d) continue;
      const dir = values[e] > values[e - 1] ? 1 : -1;
      slots.push({ s: slots[slots.length - 1].s + dir, d, at: seq[e - 1].at });
    }
    for (let j = 1; j < slots.length; j++) pos += (slots[j].s - slots[j - 1].s) * move(slots[j].at);
    // A slot is drawn from the moment it starts rolling in until the next one has fully arrived, or
    // until a reversal reuses its strip position (one digit per position, never two overprinted).
    const started = (j: number) => j === 0 || fd(frame) > slots[j].at - 1; // whole frames: blur sub-samples agree
    const live = slots
      .map((sl, j) => ({
        ...sl,
        y: sl.s - pos,
        alive: started(j) && (j === slots.length - 1 || move(slots[j + 1].at) < 1) && !slots.some((o, i) => i > j && o.s === sl.s && started(i)),
      }))
      .filter((sl) => sl.alive && Math.abs(sl.y) < 1);
    const present = clamp(live.reduce((a, sl) => a + (sl.d >= 0 ? 1 - Math.abs(sl.y) : 0), 0));
    return { live, present };
  });

  return (
    <span data-text={id} style={{ ...typeStyle(role, size), fontFamily: family, lineHeight: lead, display: 'inline-flex', ...style }}>
      {cols.map((col, c) => (
        <React.Fragment key={c}>
          <span style={{ position: 'relative', display: 'inline-block', overflow: 'hidden', height: `${lead}em` }}>
            <span style={{ visibility: 'hidden' }}>0</span>
            {col.live.map((sl) =>
              sl.d < 0 ? null : (
                <span key={sl.s + ':' + sl.at} style={{ position: 'absolute', left: 0, top: 0, transform: `translateY(${(sl.y * lead).toFixed(4)}em)` }}>
                  {sl.d}
                </span>
              ),
            )}
          </span>
          {group && c < D - 1 && (D - 1 - c) % 3 === 0 && <span style={{ opacity: col.present }}>{group}</span>}
        </React.Fragment>
      ))}
    </span>
  );
};
