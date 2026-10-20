import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { GLYPH } from '../brand/Mark';
import { OUTLINE } from '../brand/outlines';
import { C, TYPE } from '../brand/tokens';
import { clamp, E, lmix, prog, spr, SPR } from '../lib/anim';
import { ACT, copy, CUE, f60, TOTAL } from '../timeline';
import { layoutFor } from '../ui/layout';
import { Session } from './Session';

/** Bars 13-14 + tail: the iris from the avatar, the lockup on ink, the tagline and the URL. */
export const IRIS = { from: CUE.iris, dur: f60(20) };

// The end card is one SVG: its type is geometry, so the slow push through the hold re-rasterises
// smoothly every frame instead of stepping the way a scaled HTML text layer does.
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
  const markW = markSize * (GLYPH.w / GLYPH.h);
  // the wordmark slides out from behind the mark and locks; the pair is centred as one object
  copy('wordmark'); // the name is set in outline (src/brand/outlines.ts); the COPY entry keeps the budget true
  const nameSize = TYPE.display.size * (L.tall ? 0.8 : 1) * u;
  const nameK = nameSize / OUTLINE.name.size;
  const nameW = OUTLINE.name.w * nameK;
  const gap = 28 * u;
  const lockMarkW = L.end.markSize * (GLYPH.w / GLYPH.h);
  const totalW = lockMarkW + gap + nameW;
  const np = frame < CUE.markLand ? 0 : Math.min(1, spr(frame, CUE.markLand, SPR.word));
  const lockX = L.W / 2 - totalW / 2 + lockMarkW / 2; // the mark's centre once the name has arrived
  const mx = (A.ax + (L.W / 2 - A.ax) * mp) * (1 - np) + lockX * np;
  const my = A.ay + (L.end.cy - A.ay) * mp;
  const nameX = lockX + lockMarkW / 2 + gap - (1 - np) * 40 * u;
  const nameO = clamp(np * 1.6);
  // tagline lines and the URL rise in one after another
  const tagSize = TYPE.secondary.size * (L.tall ? 0.9 : 1) * u;
  const tagLines = copy('tagline').text.split('\n');
  copy('url');
  const tagY0 = L.end.cy + L.end.markSize * 0.62 + 20 * u + tagSize;
  const urlSize = TYPE.mono.size * u;
  const urlY = tagY0 + (tagLines.length - 1) * tagSize * 1.35 + 36 * u + urlSize;
  const up = prog(frame, CUE.url, CUE.url + f60(22), E.out);
  // the slow push through the hold, on the whole card
  const push = lmix(1, 1.09, prog(frame, CUE.nameLock, TOTAL, E.dolly));
  const echoes = [0.72, 0.5].map((o, i) => ({ o: o * (1 - np) * mp * 0.5, s: 1 + 0.14 * (i + 1) * (1 - mp) }));
  const markT = (sx: number) => `translate(${(mx - (markW * sx) / 2).toFixed(2)} ${(my - (markSize * sx) / 2).toFixed(2)}) scale(${((markSize * sx) / GLYPH.h).toFixed(4)})`;
  return (
    <>
      {frame < IRIS.from + IRIS.dur + 2 && <Session frame={frame} />}
      <div style={{ position: 'absolute', inset: 0, clipPath: `circle(${r.toFixed(2)}px at ${ix.toFixed(2)}px ${iy.toFixed(2)}px)`, background: C.ink }}>
        <svg width={L.W} height={L.H} viewBox={`0 0 ${L.W} ${L.H}`} style={{ position: 'absolute', left: 0, top: 0 }}>
          <g transform={`translate(${L.W / 2} ${(L.end.cy + 40 * u).toFixed(2)}) scale(${push.toFixed(4)}) translate(${-L.W / 2} ${(-(L.end.cy + 40 * u)).toFixed(2)})`}>
            {/* ban-safe echoes: plain stroked copies, one tonal step, fading as the mark lands */}
            {echoes.map((e, i) => (
              <path key={i} d={GLYPH.d} fill="none" stroke={C.mute} strokeWidth={1.5 / ((markSize * e.s) / GLYPH.h)} opacity={e.o} transform={markT(e.s)} fillRule="evenodd" />
            ))}
            <path d={GLYPH.d} fill={C.paper} fillRule="evenodd" transform={markT(1)} />
            <path d={OUTLINE.name.d} fill={C.paper} opacity={nameO} transform={`translate(${nameX.toFixed(2)} ${(L.end.cy + nameSize * 0.36).toFixed(2)}) scale(${nameK.toFixed(4)})`} />
            {[OUTLINE.tag0, OUTLINE.tag1].map((o, li) => {
              const p = prog(frame, CUE.tagline + li * f60(14), CUE.tagline + li * f60(14) + f60(26), E.out);
              const k = tagSize / o.size;
              return <path key={li} d={o.d} fill={C.paper} opacity={p} transform={`translate(${(L.W / 2 - (o.w * k) / 2).toFixed(2)} ${(tagY0 + li * tagSize * 1.35 + (1 - p) * 18 * u).toFixed(2)}) scale(${k.toFixed(4)})`} />;
            })}
            <path d={OUTLINE.url.d} fill={C.mute} opacity={up} transform={`translate(${(L.W / 2 - (OUTLINE.url.w * (urlSize / OUTLINE.url.size)) / 2).toFixed(2)} ${(urlY + (1 - up) * 14 * u).toFixed(2)}) scale(${(urlSize / OUTLINE.url.size).toFixed(4)})`} />
          </g>
        </svg>
      </div>
    </>
  );
};
