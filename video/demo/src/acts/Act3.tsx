import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { Mark } from '../brand/Mark';
import { C, TYPE, typeStyle } from '../brand/tokens';
import { arrive, clamp, E, lmix, prog, spr, SPR } from '../lib/anim';
import { measureTracked } from '../lib/measure';
import { ACT, copy, CUE, f60 } from '../timeline';
import { layoutFor } from '../ui/layout';
import { Session } from './Session';

/** Bars 13-14 + tail: the iris from the avatar, the lockup on ink, the tagline and the URL. */
export const IRIS = { from: CUE.iris, dur: f60(20) };

export const Act3: React.FC = () => {
  const frame = useCurrentFrame() + ACT.lockup.from;
  const { width, height } = useVideoConfig();
  const L = layoutFor(width, height);
  const u = L.u;
  const A = L.assistant;
  // the iris: an ink disc from the avatar, radius in log space at a constant ratio per frame
  const R = Math.hypot(Math.max(A.ax, L.W - A.ax), Math.max(A.ay, L.H - A.ay)) * 1.05;
  const ip = prog(frame, IRIS.from, IRIS.from + IRIS.dur, E.linear);
  const r = frame < IRIS.from ? 0 : lmix(22 * u, R, ip);
  const cxp = prog(frame, IRIS.from, IRIS.from + IRIS.dur, E.smooth);
  const ix = A.ax + (L.W / 2 - A.ax) * cxp;
  const iy = A.ay + (L.end.cy - A.ay) * cxp;
  // the mark: grows from the avatar's glyph to the lockup size, lands on markLand
  const mp = frame < IRIS.from ? 0 : spr(frame, IRIS.from, SPR.soft);
  const markSize = lmix(24 * u, L.end.markSize, mp);
  const mx = A.ax + (L.W / 2 - A.ax) * mp;
  const my = A.ay + (L.end.cy - A.ay) * mp;
  // the wordmark slides out from behind the mark and locks
  const name = copy('wordmark').text;
  const nameSize = TYPE.display.size * (L.tall ? 0.8 : 1) * u;
  const nameW = measureTracked(name, nameSize, TYPE.display.weight, TYPE.display.track);
  const markW = L.end.markSize * 0.57;
  const gap = 28 * u;
  const totalW = markW + gap + nameW;
  const np = frame < CUE.markLand ? 0 : spr(frame, CUE.markLand, SPR.word);
  const npc = Math.min(1, np);
  // once the name arrives the pair re-centres: the mark slides left by half the name's width
  const lockX = L.W / 2 - totalW / 2 + markW / 2;
  const markX = lmix(mx, lockX, 1) * (1 - npc) + lockX * npc;
  const finalMarkX = mp < 0.999 ? markX : lockX;
  const nameX = lockX + markW / 2 + gap;
  const nameO = clamp(np * 1.6);
  // tagline and URL rise in
  const tp = prog(frame, CUE.tagline, CUE.tagline + f60(24), E.out);
  const up = prog(frame, CUE.url, CUE.url + f60(20), E.out);
  // the slow push through the hold
  const creep = 1 + 0.05 * prog(frame, CUE.creep, CUE.settle + f60(30), E.dolly);
  const echoes = [0.72, 0.5].map((o, i) => ({ o: o * (1 - npc) * mp, s: 1 + 0.14 * (i + 1) * (1 - mp) }));
  return (
    <>
      {frame < IRIS.from + IRIS.dur + 2 && <Session frame={frame} />}
      <div style={{ position: 'absolute', inset: 0, clipPath: `circle(${r.toFixed(2)}px at ${ix.toFixed(2)}px ${iy.toFixed(2)}px)`, background: C.ink }}>
        <div style={{ position: 'absolute', inset: 0, transformOrigin: `${L.W / 2}px ${L.end.cy}px`, transform: `scale(${creep.toFixed(4)})` }}>
          {/* ban-safe echoes: plain 1.5 px stroked copies, one tonal step, fading as the mark lands */}
          {echoes.map((e, i) => (
            <div key={i} style={{ position: 'absolute', left: 0, top: 0, opacity: e.o, transform: `translate(${(finalMarkX - (markSize * 0.57) / 2).toFixed(2)}px, ${(my - markSize / 2).toFixed(2)}px) scale(${e.s.toFixed(3)})`, transformOrigin: '50% 56%' }}>
              <Mark size={markSize} color={C.mute} opacity={0.5} />
            </div>
          ))}
          <div style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${(finalMarkX - (markSize * 0.57) / 2).toFixed(2)}px, ${(my - markSize / 2).toFixed(2)}px)` }}>
            <Mark size={markSize} color={C.paper} />
          </div>
          <div
            data-text="wordmark"
            style={{
              ...typeStyle('display', nameSize),
              position: 'absolute',
              left: 0,
              top: 0,
              color: C.paper,
              opacity: nameO,
              transform: `translate(${(nameX - (1 - arrive(npc)) * 40 * u).toFixed(2)}px, ${(L.end.cy - nameSize * 0.56).toFixed(2)}px)`,
            }}
          >
            {name}
          </div>
          <div
            data-text="tagline"
            style={{
              ...typeStyle('secondary', TYPE.secondary.size * (L.tall ? 0.9 : 1) * u),
              position: 'absolute',
              left: 0,
              top: 0,
              width: L.W,
              textAlign: 'center',
              color: C.paper,
              opacity: tp,
              transform: `translate(0px, ${(L.end.cy + L.end.markSize * 0.62 + 20 * u + (1 - arrive(tp)) * 16 * u).toFixed(2)}px)`,
            }}
          >
            {copy('tagline').text}
          </div>
          <div
            data-text="url"
            style={{
              ...typeStyle('mono', TYPE.mono.size * u),
              position: 'absolute',
              left: 0,
              top: 0,
              width: L.W,
              textAlign: 'center',
              color: C.mute,
              opacity: up,
              transform: `translate(0px, ${(L.end.cy + L.end.markSize * 0.62 + 20 * u + TYPE.secondary.size * 2.4 * u + 36 * u + (1 - arrive(up)) * 12 * u).toFixed(2)}px)`,
            }}
          >
            {copy('url').text}
          </div>
        </div>
      </div>
    </>
  );
};
