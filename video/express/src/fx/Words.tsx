import React from 'react';
import { arrive, blurIn, blurOut, depart, E, prog } from '../lib/anim';

/**
 * Word-by-word reveal: each word rises 0.32 em, sharpens from blur and fades in over `dur` frames,
 * `stagger` frames apart. The exit runs at half the stagger: the word accelerates away on E.in
 * (through `depart`, blurring only once it moves fast, `blurOut`) while its opacity fades on
 * E.smooth, which is already near 0 when the move is fastest and has no slope at its end. Opacity on
 * the exit's E.in would hold the word near full strength and drop the last half in 2-3 frames: a
 * visible pop as each word leaves. Text lands sharp: the
 * blur ends while the word is still moving fast (blurIn), because Chromium renders radii under
 * ~0.75 px fully sharp and a slow finish would snap into focus. The rise itself ends on `arrive`
 * (and the exit starts on `depart`): vertical text positions snap to whole pixels, so an
 * ease-out's slow tail would settle in 1 px ticks. Transform-only placement.
 * The whole line carries data-text so scripts/layout-audit.sh can check it.
 */
export const Words: React.FC<{
  text: string;
  frame: number; // local frame
  start: number; // first word begins (word i begins at start + i*stagger, or at starts[i])
  id?: string; // data-text id for the layout audit
  starts?: number[];
  stagger?: number;
  dur?: number;
  rise?: number; // em
  blur?: number; // px
  out?: number; // frame the exit begins (optional)
  outDur?: number;
  style?: React.CSSProperties;
  wordStyle?: (i: number, p: number) => React.CSSProperties; // p = that word's 0..1 entrance
}> = ({ text, frame, start, id = 'words', starts, stagger = 8, dur = 26, rise = 0.32, blur = 8, out, outDur = 16, style, wordStyle }) => {
  const words = text.split(' ');
  return (
    <span data-text={id} style={{ display: 'inline-flex', flexWrap: 'nowrap', whiteSpace: 'pre', ...style }}>
      {words.map((w, i) => {
        const s = starts?.[i] ?? start + i * stagger;
        const p = prog(frame, s, s + dur, E.out);
        const o = out === undefined ? 0 : out + i * (stagger / 2);
        const q = out === undefined ? 0 : prog(frame, o, o + outDur, E.in); // the move accelerates away
        const fade = out === undefined ? 0 : prog(frame, o, o + outDur, E.smooth); // the fade has no pop at either end
        const b = blurIn(p, blur) + blurOut(q, blur);
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              transform: `translateY(${((1 - arrive(p)) * rise - depart(q) * rise * 0.6).toFixed(4)}em)`,
              filter: b > 0.05 ? `blur(${b.toFixed(2)}px)` : undefined,
              opacity: p * (1 - fade),
              ...wordStyle?.(i, p),
            }}
          >
            {w}
            {i < words.length - 1 ? ' ' : ''}
          </span>
        );
      })}
    </span>
  );
};
