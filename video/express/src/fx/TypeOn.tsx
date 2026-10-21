import React from 'react';
import { FONT, TYPE, U, typeStyle } from '../brand/tokens';
import { clamp, E, Ease, fd, mix, prog } from '../lib/anim';
import { baselineOf, inkBox, measureTracked } from '../lib/measure';
import { f60, FPS } from '../timeline';

type Role = keyof typeof TYPE;

export type TypeTiming = {
  start: number; // typing begins; the first character shows on the next whole frame
  dur?: number; // time box in frames (default 2 f per character at 60 fps: 30 chars/s on average)
  ease?: Ease; // the character count's progress over the box (default E.type: fast start, slow end)
  cps?: number; // linear typing at this many characters per second instead (overrides dur and ease)
};
export type TypeFont = { role?: Role; size?: number; family?: string };

const boxOf = (len: number, t: TypeTiming) => (t.cps ? (len * FPS) / t.cps : Math.max(1, t.dur ?? f60(2 * len)));

/** Characters typed at frame f, continuous (0..len). */
const typedAt = (len: number, f: number, t: TypeTiming) =>
  t.cps ? clamp(((f - t.start) * t.cps) / FPS, 0, len) : len * (t.ease ?? E.type)(clamp((f - t.start) / boxOf(len, t)));

/**
 * Whole frame on which each character of a `len`-character string first shows. The component reads
 * the same schedule, so key sounds put on these frames land on the picture exactly:
 * KEY_FRAMES = typeFrames(PROMPT.length, TYPE_T).map((k) => k + ACT.proof.from).
 */
export const typeFrames = (len: number, t: TypeTiming): number[] => {
  const at: number[] = [];
  const end = Math.ceil(t.start + boxOf(len, t)) + 1;
  for (let F = Math.ceil(t.start); F <= end && at.length < len; F++) {
    const n = Math.min(len, Math.ceil(typedAt(len, F, t) - 1e-6));
    while (at.length < n) at.push(F);
  }
  while (at.length < len) at.push(end);
  return at;
};

/**
 * Typing state at `frame`, the same numbers the component draws with (call it under FontGate, like
 * every measurement): `n` characters shown (decided on fd(frame)), `at` their first frames, `caretX`
 * (the typed text's right edge, px from its left edge; steps with each key; the drawn caret sits
 * the tracking plus 0.03 em further right), `followX` (the same edge, continuous: give it to a
 * camera that follows the caret, through a lag, so the camera never steps), and whether keys are
 * still landing.
 */
export const typeOn = (text: string, frame: number, t: TypeTiming & TypeFont) => {
  const role = t.role ?? 'display';
  const size = t.size ?? TYPE[role].size * U;
  const { weight, track } = TYPE[role];
  const family = t.family ?? FONT.text;
  const len = text.length;
  const at = typeFrames(len, t);
  const F = fd(frame);
  const n = at.filter((k) => k <= F).length;
  const wOf = (k: number) => (k <= 0 ? 0 : measureTracked(text.slice(0, k), size, weight, track, family));
  const c = typedAt(len, frame, t);
  const lo = Math.floor(c);
  const followX = lo >= len ? wOf(len) : mix(wOf(lo), wOf(lo + 1), c - lo);
  const last = len ? at[len - 1] : t.start;
  return { n, at, caretX: wOf(n), followX, typing: F >= t.start && F < last, last, size, weight, track, family };
};

/**
 * Typewriter with a caret. The character count follows an eased progress over a time box (E.type:
 * about 1 char/f at the start, the last key at ~80% of the box) or a linear `cps` rate, decided on
 * whole frames (fd), so motion-blur sub-samples never show a half-typed letter or a double caret.
 * Defaults at 60 fps: box = 2 f per character, head fade 4 f (each new character ramps in on E.ui,
 * so a burst of 2-3 keys in one frame never pops; 0 = keys appear whole, like a real field), caret
 * solid while keys land and blinking 30 f on / 30 f off while idle, phase-locked to the last key.
 * Every character is laid out from the first frame (untyped ones at opacity 0) and only opacity
 * changes, so earlier characters never reflow, and the caret sits on measured prefix widths of the
 * loaded font (FontGate). Single line. Use typeOn() for the caret position (camera follow) and
 * typeFrames() for the key sounds. `charStyle(i, age)` styles character i, `age` whole frames
 * after it appeared (an accent that relaxes to ink over 12 f: references/product-ui.md §6).
 */
export const TypeOn: React.FC<
  TypeTiming &
    TypeFont & {
      text: string;
      frame: number; // local frame
      id?: string; // data-text id for the layout audit
      fade?: number; // head fade, frames
      caret?: boolean;
      caretColor?: string; // default: the text colour
      blink?: number; // frames on, then the same off, while idle
      caretOut?: number; // frame the caret is removed (the field submits)
      style?: React.CSSProperties;
      charStyle?: (i: number, age: number) => React.CSSProperties;
    }
> = ({ text, frame, id = 'type', fade = f60(4), caret = true, caretColor = 'currentColor', blink = f60(30), caretOut, style, charStyle, ...t }) => {
  const s = typeOn(text, frame, t);
  const role = t.role ?? 'display';
  const lead = TYPE[role].lead;
  const F = fd(frame);
  // Caret: solid while typing; idle, it blinks with a phase anchored on the typing edges.
  const anchor = F < t.start ? t.start : s.last;
  const on = s.typing || Math.floor(Math.abs(F - anchor) / Math.max(1, blink)) % 2 === 0;
  const showCaret = caret && (caretOut === undefined || F < caretOut);
  const ink = inkBox('Hg', s.size, s.weight, s.family);
  const base = baselineOf(s.size, s.weight, lead, s.family);
  const cw = Math.max(2 * U, 0.055 * s.size);
  const cy = base - ink.ascent - 0.07 * s.size;
  const ch = ink.ascent + ink.descent + 0.14 * s.size;
  // CSS puts the (negative) tracking after each glyph, so the last glyph's ink can reach past the
  // next glyph's origin: clear it by the tracking plus a hairline gap.
  const cx = s.n > 0 ? s.caretX + Math.max(0, -s.track) * s.size + 0.03 * s.size : 0;
  return (
    <span data-text={id} style={{ ...typeStyle(role, s.size), fontFamily: s.family, position: 'relative', display: 'inline-block', ...style }}>
      {[...text].map((c, i) => {
        const shown = F >= s.at[i];
        const o = !shown ? 0 : fade > 0 ? prog(frame, s.at[i] - 1, s.at[i] - 1 + fade, E.ui) : 1;
        return (
          <span key={i} style={{ opacity: o, ...(shown ? charStyle?.(i, F - s.at[i]) : undefined) }}>
            {c}
          </span>
        );
      })}
      {showCaret && (
        <span
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: cw,
            height: ch,
            borderRadius: cw / 2,
            background: caretColor,
            opacity: on ? 1 : 0,
            transform: `translate(${cx.toFixed(3)}px, ${cy.toFixed(3)}px)`,
          }}
        />
      )}
    </span>
  );
};
