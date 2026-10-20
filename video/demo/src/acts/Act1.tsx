import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { MARK, Mark, placeMark } from '../brand/Mark';
import { C, SAFE, TYPE, U, typeStyle } from '../brand/tokens';
import { arrive, blurIn, blurOut, depart, E, hitPulse, lmix, mix, prog } from '../lib/anim';
import { breath, camera } from '../lib/camera';
import { mixColor } from '../lib/color';
import { baselineOf, measureTracked } from '../lib/measure';
import { peak, settleOf } from '../lib/sync';
import { ACT, copy, CUE, f60, H, W } from '../timeline';
import { DOT_SLOT, HERO } from './Act2';

// ACT 1 - the statement counts itself in. The accent dot (the film's device) waits where the
// period will be and ticks on every beat; each tick calls in one word, which arrives in the
// accent and relaxes to ink. The words sit a little apart until the downbeat of bar 2, when the
// line closes up with velocity and locks, the dot seated as its period. After a read hold the
// words leave (their entrance reversed, from the dot's end) and the dot flies to its slot in the
// mark: Act 2 opens on exactly the pose this act ends on.

const L = (abs: number) => abs - ACT.statement.from; // absolute cue -> act-local frame

const LINE = copy('statement');
const WORDS = LINE.text.split(' ');
const BEATS = [CUE.word1, CUE.word2, CUE.word3, CUE.word4].map(L); // one word per beat
if (BEATS.length !== WORDS.length) throw new Error('Act1: one CUE.word* per word of the statement');

const WORD_IN = f60(22); // frames per word entrance
const POP = settleOf(0, WORD_IN, E.out, 0.5); // start -> 50% frames, so each word pops ON its beat
const LOCK = L(CUE.lock);
const LOCK_IN = f60(12); // the line closes up on E.contact: it arrives with speed and stops dead
const SPREAD = 0.22; // em of extra space in every gap until the lock
const OUT = L(LINE.out);
const DOT = { d: 0.2, gap: 0.06 }; // the period, in em: a little heavier than the font's own

// The dot's flight to its slot. Its speed peaks ON a beat (CUE.fly, where the whoosh apex goes) and
// it arrives at rest on the act seam: solve the start from where this curve peaks.
const FLY_EASE = E.rest;
const PEAK_AT = peak(0, 1000, FLY_EASE) / 1000; // fraction of the move where speed peaks
/** The dot's flight (absolute frames) and its curve, for src/sync.ts: peak(from, to, ease) === CUE.fly. */
export const DOT_TRAVEL = { from: Math.round(CUE.handoff - (CUE.handoff - CUE.fly) / (1 - PEAK_AT)), to: CUE.handoff, ease: FLY_EASE };

export const Act1: React.FC = () => {
  const f = useCurrentFrame();
  const disp = TYPE.display;

  // Layout from the real font: size fits the safe width even while the line is spread. The
  // measured width ends one (negative) tracking short of the last glyph; add it back (see textW).
  const unit = measureTracked(LINE.text, 100, disp.weight, disp.track) / 100 - disp.track;
  const size = Math.min(disp.size * U, (W - 2 * SAFE.x) / (unit + DOT.gap + DOT.d + WORDS.length * SPREAD));
  const xs = WORDS.map((_, i) => (i ? measureTracked(WORDS.slice(0, i).join(' ') + ' ', size, disp.weight, disp.track) : 0));
  // CSS adds the (negative) tracking after the last glyph too, so the measured width stops short
  // of the final letter's advance; add it back or the period collides with the "t".
  const textW = measureTracked(LINE.text, size, disp.weight, disp.track) - disp.track * size;
  const x0 = (W - textW - (DOT.gap + DOT.d) * size) / 2;
  const top = H / 2 - (size * disp.lead) / 2;
  const base = top + baselineOf(size, disp.weight, disp.lead);

  // The lock: element i (words, then the dot) sits (i - n/2) spreads off its place until it closes.
  const lock = prog(f, LOCK - LOCK_IN, LOCK, E.contact);
  const spread = (i: number) => (i - WORDS.length / 2) * SPREAD * size * (1 - lock);
  const punch = 1 + 0.025 * hitPulse(f - LOCK);
  const push = breath(prog(f, LOCK, ACT.statement.dur, E.dolly), 0.03); // the read hold keeps building

  // The device: ticks with each word, hits on the lock, keeps time once, then flies to the mark.
  const tick = Math.max(...BEATS.map((bt) => hitPulse(f - bt)));
  const pulse = 0.3 * tick + 0.35 * hitPulse(f - LOCK) + 0.2 * hitPulse(f - L(CUE.pulse));
  const fly = prog(f, L(DOT_TRAVEL.from), L(DOT_TRAVEL.to), DOT_TRAVEL.ease);
  // The dot is placed in screen space: as the period it follows the line's camera (punch, push);
  // in flight it leaves that camera for its slot, which Act 2 opens on with no camera at all.
  const cam = { ax: W / 2, ay: H / 2, sx: W / 2, sy: H / 2, k: punch * push };
  const period = { x: x0 + textW + (DOT.gap + DOT.d / 2) * size + spread(WORDS.length), y: base - (DOT.d * size) / 2 };
  const onScreen = { x: cam.sx + (period.x - cam.ax) * cam.k, y: cam.sy + (period.y - cam.ay) * cam.k };
  const cx = mix(onScreen.x, DOT_SLOT.x, fly);
  const cy = mix(onScreen.y, DOT_SLOT.y, fly);
  const k = lmix(DOT.d * size * cam.k, DOT_SLOT.d, fly) / DOT_SLOT.d; // diameter in log space; k = 1 in the slot
  const unitPx = (HERO.size / 100) * k;

  return (
    <AbsoluteFill style={{ background: C.paper, overflow: 'hidden' }}>
      <div style={camera(cam)}>
        {WORDS.map((w, i) => {
          const s = BEATS[i] - POP;
          const p = prog(f, s, s + WORD_IN, E.out);
          // Exit: the entrance reversed, last word first, so the dot's path to the mark is clear.
          const o = OUT + (WORDS.length - 1 - i) * f60(3);
          const q = prog(f, o, o + f60(14), E.in); // the move accelerates away
          const fade = prog(f, o, o + f60(14), E.smooth); // the fade eases at both ends: no last-frame pop
          const blur = blurIn(p, 10) + blurOut(q, 8); // blur only while moving fast: Chromium steps small radii
          return (
            <span
              key={i}
              data-text={`statement.${i}`}
              style={{
                ...typeStyle('display', size),
                position: 'absolute',
                left: 0,
                top: 0,
                color: mixColor(C.accent, C.ink, prog(f, BEATS[i], BEATS[i] + f60(14), E.smooth)), // arrives in the accent, relaxes to ink
                opacity: p * (1 - fade),
                filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : undefined,
                // arrive/depart: vertical text snaps to whole pixels, so the rise must not creep its last pixels
                transform: `translate(${x0 + xs[i] + spread(i)}px, ${top + ((1 - arrive(p)) * 0.32 + depart(q) * 0.2) * size}px)`,
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
      <Mark size={HERO.size} only={['D']} d={{ s: 1 + pulse }} style={placeMark(cx - MARK.D.cx * unitPx, cy - MARK.D.cy * unitPx, k)} />
    </AbsoluteFill>
  );
};
