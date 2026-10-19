import React from 'react';
import { FONT, TYPE, U, typeStyle } from '../brand/tokens';
import { arrive, arriveK, blurIn, depart, E, Ease, prog } from '../lib/anim';
import { f60 } from '../timeline';

type Role = keyof typeof TYPE;

/**
 * Line or word cascade that rises from behind a mask under its baseline: each line sits in its own
 * clip (overflow hidden), and each word (`by="word"`) or whole line (`by="line"`) starts one full
 * line below it, so nothing shows until it crosses the mask's edge. Units start `stagger` frames
 * apart in reading order and rise on `ease`, ending through arrive() at arriveK(), so the rise
 * stops from ~1 px/f at any size (vertical text snaps to whole pixels, so an ease-out tail would
 * tick: references/chromium-rendering.md §15); text lands sharp because nothing scales and blur
 * is off unless asked for (then blurIn clears it by 60%). The exit rises out through the top on
 * E.in (through depart), first word first, at half the stagger; E.in covers 6% of the travel in
 * its first 60%, which depart skips, so a word is seen leaving ~10 f after `out` (at the default
 * 16 f). Defaults at 60 fps: 30 f per unit on E.out, stagger 5 f, exit 16 f. The clip is padded
 * 0.12 em on top, 0.26 em under the line box and 0.1 em at the sides, so descenders and overhangs
 * are never shaved on a landed line, and the travel covers the padding. Lines are `\n`-separated;
 * each line's text box carries data-text `${id}.${i}` while any of it is on screen.
 */
export const MaskRise: React.FC<{
  text: string;
  frame: number; // local frame
  start: number;
  id?: string;
  by?: 'word' | 'line';
  stagger?: number;
  dur?: number;
  ease?: Ease;
  out?: number; // frame the exit begins (optional)
  outDur?: number;
  blur?: number; // px at the start of the rise; 0 = none
  role?: Role;
  size?: number;
  family?: string;
  align?: 'left' | 'center' | 'right';
  style?: React.CSSProperties;
}> = ({ text, frame, start, id = 'rise', by = 'word', stagger = f60(5), dur = f60(30), ease = E.out, out, outDur = f60(16), blur = 0, role = 'display', size = TYPE[role].size * U, family = FONT.text, align = 'left', style }) => {
  const lead = TYPE[role].lead;
  const pad = { t: 0.12, b: 0.26, x: 0.1 };
  // em: starts wholly below the clip and ends wholly above it (glyph ink overhangs a tight line box ~0.1 em)
  const travel = lead + pad.t + pad.b;
  const ka = arriveK(travel * size, dur, ease); // the rise stops from ~1 px/f at any size
  const lines = text.split('\n').map((l) => l.split(' '));
  let k = -1; // reading-order index of the unit
  return (
    // a flex column, so the clips' negative margins never collapse into each other
    <div style={{ ...typeStyle(role, size), fontFamily: family, textAlign: align, display: 'flex', flexDirection: 'column', ...style }}>
      {lines.map((words, li) => {
        const units = by === 'word' ? words.map((w, wi) => (wi < words.length - 1 ? w + ' ' : w)) : [words.join(' ')];
        const ps = units.map(() => {
          k++;
          const s = start + k * stagger;
          const o = out === undefined ? Infinity : out + k * (stagger / 2);
          return { p: prog(frame, s, s + dur, ease), q: out === undefined ? 0 : prog(frame, o, o + outDur, E.in) };
        });
        const onScreen = ps.some((u) => u.p > 0 && u.q < 1);
        return (
          <div key={li} style={{ overflow: 'hidden', padding: `${pad.t}em ${pad.x}em ${pad.b}em`, margin: `-${pad.t}em -${pad.x}em -${pad.b}em` }}>
            <span data-text={onScreen ? `${id}.${li}` : undefined} style={{ display: 'inline-block', whiteSpace: 'pre' }}>
              {units.map((u, ui) => {
                const { p, q } = ps[ui];
                const y = (1 - arrive(p, ka)) * travel - depart(q) * travel;
                const b = blur > 0 ? blurIn(p, blur) : 0;
                return (
                  <span
                    key={ui}
                    style={{
                      display: 'inline-block',
                      whiteSpace: 'pre',
                      transform: `translateY(${y.toFixed(4)}em)`,
                      filter: b > 0.05 ? `blur(${b.toFixed(2)}px)` : undefined,
                      visibility: p <= 0 || q >= 1 ? 'hidden' : undefined,
                    }}
                  >
                    {u}
                  </span>
                );
              })}
            </span>
          </div>
        );
      })}
    </div>
  );
};
