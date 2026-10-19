import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { MARK, Mark, placeMark } from '../brand/Mark';
import { C, SAFE, TYPE, U, typeStyle } from '../brand/tokens';
import { camera } from '../lib/camera';
import { E, hitPulse, lmix, mix, prog, spr, SPR, squash } from '../lib/anim';
import { baselineOf, inkBox, measureTracked } from '../lib/measure';
import { delayTo } from '../lib/sync';
import { ACT, copy, CUE, f60, H, W } from '../timeline';

// ACT 2 - the dot becomes the mark. It opens on the dot at rest in its slot (Act 1 hands it over
// on exactly this pose). The dome drops in and the block slides in, each landing ON its beat;
// then the mark settles into the lockup while the name slides out from behind its live edge and
// locks on the downbeat. The lockup keeps building (a 20% dolly, the dot keeping time) to the end.

const L = (abs: number) => abs - ACT.mark.from; // absolute cue -> act-local frame

/** The hero mark: box size and top-left at the start of the act (Act 1's dot flies to its slot). */
export const HERO = { size: 300 * U, x: W / 2 - 150 * U, y: H / 2 - 150 * U };

// Landings: start each spring early by exactly the frames it needs to reach its slot, so the
// contact frame IS the cue (the sound goes there too). A stiff spring arrives with velocity.
const LAND = SPR.snap;
const CONTACT = { a: L(CUE.pieceA), b: L(CUE.pieceB) };
const START = { a: CONTACT.a - delayTo(LAND), b: CONTACT.b - delayTo(LAND) };

const NAME = copy('wordmark');
/** The lockup move (absolute frames) and its curve, exported for src/sync.ts (whoosh on its peak). */
export const LOCKUP_MOVE = { from: NAME.in, to: NAME.resolved, ease: E.inOut };
const DOLLY = { from: L(CUE.lockup) - f60(20), to: ACT.mark.dur, k: 1.2 }; // a 20% push: a lockup hold keeps building

export const Act2: React.FC = () => {
  const f = useCurrentFrame();

  // --- the pieces land -------------------------------------------------------------------
  // After contact the pose is exactly the rest pose: no overshoot into the neighbours, no rebound.
  const sa = f >= CONTACT.a ? 1 : spr(f, START.a, LAND);
  const sb = f >= CONTACT.b ? 1 : spr(f, START.b, LAND);
  const qa = squash(f - CONTACT.a); // squash against the contact edge for ~8 frames
  const qb = squash(f - CONTACT.b);
  // Travel is kept short enough that the fastest frame stays under ~80 px/f (the dome peaks near
  // 58, the block near 70): faster than that, blur cannot make a move read as motion. Each piece
  // is born on its first frames of travel instead of flying in from off-frame.
  const born = (s: number) => prog(f, s, s + f60(6), E.smooth);
  const a = { y: (1 - sa) * -120, rot: (1 - sa) * 9, sx: qa.across, sy: qa.along, origin: [50, 50] as [number, number], o: born(START.a) };
  const b = { x: (1 - sb) * -150, rot: (1 - sb) * -12, sx: qb.along, sy: qb.across, origin: [46, 79] as [number, number], o: born(START.b) };

  // --- the lockup ------------------------------------------------------------------------
  // The name is the display token at 1.5x, shrunk only if the lockup would leave the safe width.
  // The mark stands from the name's baseline to its ascender line; the gap is 0.3 of its height.
  const disp = TYPE.display;
  const per100 = { w: measureTracked(NAME.text, 100, disp.weight, disp.track) / 100, asc: inkBox(NAME.text, 100, disp.weight).ascent / 100 };
  const nameSize = Math.min(disp.size * 1.5 * U, (W - 2 * SAFE.x) / (per100.w + 1.3 * per100.asc));
  const nameW = per100.w * nameSize;
  const M1 = per100.asc * nameSize;
  const gap = 0.3 * M1;
  const lockW = M1 + gap + nameW;
  const base = H / 2 + M1 / 2; // baseline: the lockup's visual centre sits on frame centre
  const end = { x: (W - lockW) / 2, y: base - M1 };

  const lk = prog(f, L(LOCKUP_MOVE.from), L(LOCKUP_MOVE.to), LOCKUP_MOVE.ease);
  const k = lmix(1, M1 / HERO.size, lk); // mark scale relative to the hero size, in log space
  const mx = mix(HERO.x, end.x, lk);
  const my = mix(HERO.y, end.y, lk);
  const markRight = mx + HERO.size * k;
  // The name rides out from behind the mark's moving edge and is clipped by it, never by a fixed box.
  const nameX = markRight + gap - (1 - lk) * (nameW + gap);
  const maskX = markRight + gap * 0.5; // the mask's left edge follows the mark
  const nameTop = base - baselineOf(nameSize, disp.weight, 1);

  // --- camera: punches on the landings and the lock, a slow dolly through the hold ---------
  // The hero mark and the finished lockup are both centred, so everything pushes about frame centre.
  const punch = 1 + 0.025 * hitPulse(f - CONTACT.a) + 0.03 * hitPulse(f - CONTACT.b) + 0.015 * hitPulse(f - L(CUE.lockup));
  const dolly = lmix(1, DOLLY.k, prog(f, DOLLY.from, DOLLY.to, E.dolly));
  const cam = camera({ ax: W / 2, ay: H / 2, sx: W / 2, sy: H / 2, k: punch * dolly });

  // The dot keeps the clock: a tick on each hold beat, a small lift when each piece lands.
  // Small amplitudes: at +6% the dot's gaps to the dome and block stay above 6 units.
  const tick = Math.max(...[CUE.tick1, CUE.tick2, CUE.tick3].map((c) => hitPulse(f - L(c))));
  const d = { s: 1 + 0.06 * tick + 0.05 * (hitPulse(f - CONTACT.a) + hitPulse(f - CONTACT.b)) };

  return (
    <AbsoluteFill style={{ background: C.paper, overflow: 'hidden' }}>
      <div style={cam}>
        <Mark size={HERO.size} a={a} b={b} d={d} style={placeMark(mx, my, k)} />
        {lk > 0 && (
          <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, overflow: 'hidden', transform: `translateX(${maskX}px)` }}>
            <span
              data-text="wordmark"
              style={{ ...typeStyle('display', nameSize), lineHeight: 1, color: C.ink, position: 'absolute', left: 0, top: 0, transform: `translate(${nameX - maskX}px, ${nameTop}px)` }}
            >
              {NAME.text}
            </span>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

/** Where the dot sits at the start of this act (screen px): Act 1 flies the device here. */
export const DOT_SLOT = {
  x: HERO.x + (MARK.D.cx / 100) * HERO.size,
  y: HERO.y + (MARK.D.cy / 100) * HERO.size,
  d: ((2 * MARK.D.r) / 100) * HERO.size,
};
