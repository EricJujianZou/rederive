import React from 'react';
import { C, FONT, TYPE, U, typeStyle } from '../brand/tokens';
import { E, fd, prog, rand } from '../lib/anim';
import { measureTracked } from '../lib/measure';
import { f60 } from '../timeline';

type Role = keyof typeof TYPE;

const DIGITS = '0123456789';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const scrambles = (ch: string) => /[0-9A-Za-z]/.test(ch); // spaces and punctuation hold still
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

export type ScrambleTiming = {
  start: number;
  hold?: number; // frames every glyph cycles before the first one locks
  stagger?: number; // frames between locks
  order?: 'ltr' | 'random';
  seed?: number | string;
};

/** Rank of each scrambling character in the lock order (-1 for characters that never scramble). */
const ranks = (text: string, order: 'ltr' | 'random', seed: number | string) => {
  const idx = [...text].map((c, i) => (scrambles(c) ? i : -1)).filter((i) => i >= 0);
  if (order === 'random') idx.sort((a, b) => rand(`${seed}:o:${a}`) - rand(`${seed}:o:${b}`));
  const r = [...text].map(() => -1);
  idx.forEach((i, k) => (r[i] = k));
  return r;
};

/**
 * Whole frame each character locks to its final glyph (characters that never scramble: `start`).
 * Put a tick on each for sound (they are integers); the component reads the same schedule.
 */
export const scrambleFrames = (text: string, t: ScrambleTiming): number[] => {
  const { start, hold = f60(18), stagger = f60(3), order = 'ltr', seed = 0 } = t;
  return ranks(text, order, seed).map((r) => (r < 0 ? Math.round(start) : Math.round(start + hold + r * stagger)));
};

/**
 * Decode reveal. Every letter and digit cycles through glyphs of (nearly) its own width, then locks
 * to its final glyph, left to right or in a seeded random order, `stagger` frames apart. About
 * `rate` glyphs change per frame across the whole line (each on its own evenly spaced phase), never
 * all at once: a calm decode, not noise. Deterministic from `seed`; all state on fd(frame).
 * Defaults at 60 fps: fade-in 10 f (E.smooth), hold 18 f, stagger 3 f, rate 1.5 glyphs/f, cycling
 * glyphs in C.mute. The layout never jumps: the final text is laid out from the first frame (only
 * opacity changes, tabular figures, kerning intact) and each cycling glyph is drawn on its own
 * layer, centred on its cell, from a pool of the same class (digits, capitals or lower case) whose
 * advance is within 8% of the final glyph's (at least the 6 nearest). `set` replaces the pool.
 * `lockStyle(i, age)` styles character i, `age` whole frames after it locked.
 */
export const Scramble: React.FC<
  ScrambleTiming & {
    text: string;
    frame: number; // local frame
    id?: string; // data-text id for the layout audit
    rate?: number;
    fadeIn?: number;
    set?: string;
    color?: string; // colour of the cycling glyphs
    role?: Role;
    size?: number;
    family?: string;
    style?: React.CSSProperties;
    lockStyle?: (i: number, age: number) => React.CSSProperties;
  }
> = ({ text, frame, id = 'scramble', rate = 1.5, fadeIn = f60(10), set, color = C.mute, role = 'display', size = TYPE[role].size * U, family = FONT.text, style, lockStyle, ...t }) => {
  const { start, seed = 0 } = t;
  const { weight, track } = TYPE[role];
  const F = fd(frame);
  if (F < start) return null;
  const chars = [...text];
  const locks = scrambleFrames(text, t);
  const order = ranks(text, t.order ?? 'ltr', seed);
  const m = order.filter((r) => r >= 0).length;
  const P = Math.max(1, Math.round(m / Math.max(0.1, rate))); // frames between changes of one glyph
  const w = (s: string) => measureTracked(s, size, weight, track, family);
  const fade = prog(frame, start, start + fadeIn, E.smooth);
  // Each cycling cell changes every P frames on its own phase; a seeded permutation spreads the
  // phases evenly, so about m / P = `rate` glyphs change on any one frame.
  const slot = [...order.keys()].filter((i) => order[i] >= 0).sort((a, b) => rand(`${seed}:p:${a}`) - rand(`${seed}:p:${b}`));

  const cycling = chars.map((ch, i) => {
    if (order[i] < 0 || F >= locks[i]) return null;
    const base = set ?? (/[0-9]/.test(ch) ? DIGITS : /[A-Z]/.test(ch) ? UPPER : LOWER);
    const wt = w(ch);
    const byWidth = [...base].map((g) => ({ g, d: Math.abs(w(g) - wt) })).sort((a, b) => a.d - b.d || a.g.localeCompare(b.g));
    const near = byWidth.filter((x) => x.d <= 0.08 * wt);
    const pool = (near.length >= 6 ? near : byWidth.slice(0, 6)).map((x) => x.g);
    const L = pool.length;
    // Glyph k of this cell: a seeded start and a stride coprime with the pool, so consecutive glyphs always differ.
    const phase = Math.round((slot.indexOf(i) * P) / Math.max(1, m));
    const k = Math.floor((F - start + phase) / P);
    let stride = 1 + Math.floor(rand(`${seed}:s:${i}`) * Math.max(1, L - 1));
    while (L > 1 && gcd(stride, L) !== 1) stride++;
    const g = pool[(Math.floor(rand(`${seed}:a:${i}`) * L) + k * stride) % L];
    // Centre the glyph on its cell (tracking trails each glyph, so take it off both widths).
    const x0 = w(text.slice(0, i));
    const cell = w(text.slice(0, i + 1)) - x0 - track * size;
    const gw = w(g) - track * size;
    return { i, g, x: x0 + (cell - gw) / 2 };
  });

  return (
    <span data-text={id} style={{ ...typeStyle(role, size), fontFamily: family, position: 'relative', display: 'inline-block', opacity: fade, ...style }}>
      {chars.map((ch, i) => {
        const locked = order[i] < 0 || F >= locks[i];
        return (
          <span key={i} style={{ opacity: locked ? 1 : 0, ...(locked && order[i] >= 0 ? lockStyle?.(i, F - locks[i]) : undefined) }}>
            {ch}
          </span>
        );
      })}
      {cycling.map((c) =>
        c ? (
          <span key={`g${c.i}`} aria-hidden style={{ position: 'absolute', left: 0, top: 0, color, transform: `translateX(${c.x.toFixed(3)}px)` }}>
            {c.g}
          </span>
        ) : null,
      )}
    </span>
  );
};
