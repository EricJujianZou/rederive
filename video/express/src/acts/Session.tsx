import React from 'react';
import { useVideoConfig } from 'remotion';
import { GLYPH } from '../brand/Mark';
import { C, TYPE, typeStyle } from '../brand/tokens';
import { blurIn, blurOut, clamp, E, lmix, prog, spr, SPR } from '../lib/anim';
import { camera, Shot } from '../lib/camera';
import { copy, CUE, f60 } from '../timeline';
import { AssistantBubble, Avatar, Composer, HeaderPill, RepoCard, ThinkingRing, Typed } from '../ui/Chat';
import { Diagram } from '../ui/Diagram';
import { CARD_DROP_START } from '../ui/diagram-math';
import { D, layoutFor, SV } from '../ui/layout';
import { SCHEDULES } from '../ui/typing';

// The whole session as one continuous take on the absolute frame. Acts 1 and 2 both render this;
// the lockup act renders it under the iris. The camera moves the drawing only; the chat is a HUD.

/** The camera on the drawing: k and the world point it frames, per absolute frame. */
export const shotAt = (frame: number, L: ReturnType<typeof layoutFor>): Shot => {
  const { cx, cy, k } = L.diagram;
  const home: Shot = { ax: cx, ay: cy, sx: cx, sy: cy, k: 1 };
  // push 1: on the open row as the request slips through; back out as the constraint is read
  const row = { x: cx + D.server.x * k, y: cy + ((SV.top + SV.bottom) / 2) * k };
  const p1 = prog(frame, CUE.pushIn - f60(6), CUE.pushIn + f60(44), E.cam);
  const r1 = prog(frame, CUE.pullOut, CUE.pullOut + f60(40), E.cam);
  // push 2: on the chain as the request steps through; back out under the payoff
  const chain = { x: cx - 60 * k, y: cy };
  const p2 = prog(frame, CUE.pushIn2 - f60(4), CUE.pushIn2 + f60(36), E.cam);
  const r2 = prog(frame, CUE.pullOut2, CUE.pullOut2 + f60(40), E.cam);
  const z1 = p1 * (1 - r1);
  const z2 = p2 * (1 - r2);
  // the pull-backs dip a touch wider than home and settle (cam-zoom-out-hop)
  const dip = 1 - 0.03 * Math.sin(Math.PI * r1) ** 2 - 0.02 * Math.sin(Math.PI * r2) ** 2;
  const breath = 1 + 0.02 * Math.sin((frame / 60) * 0.9);
  // the drawing opens a touch wide and eases to rest while the first problem is posed
  const settle = lmix(1.06, 1, prog(frame, CUE.drawIn, CUE.problemResolved, E.cam));
  // while the user types, the camera leans in 4 percent and lets go on the send (the wide shot never locks off)
  const lean = ([
    [CUE.type1, CUE.send1],
    [CUE.type2, CUE.send2],
    [CUE.type3, CUE.send3],
  ] as const).reduce((acc, [t, s]) => acc + prog(frame, t, s, E.inOut) * (1 - prog(frame, s, s + f60(20), E.out)), 0);
  const k1 = lmix(1, 1.25, z1) * lmix(1, 1.15, z2) * breath * settle * dip * (1 + 0.04 * lean); // 1.25 keeps the server's counter under the bubble and its last row above the composer
  const ax = cx + (row.x - cx) * z1 + (chain.x - cx) * z2;
  const ay = cy + (row.y - cy) * z1;
  const sx = cx + (row.x - cx) * z1 * 0.3 + (chain.x - cx) * z2 * 0.4;
  const sy = cy + (row.y - cy) * z1 * 0.3 + 36 * L.u * z2; // the chain shot sits a touch lower, clear of the bubble
  return { ...home, ax, ay, sx, sy, k: k1 };
};

/** The proposition: the ∂ draws itself as an outline, fills, and the line streams beneath it. */
const Intro: React.FC<{ frame: number; L: ReturnType<typeof layoutFor> }> = ({ frame, L }) => {
  const out = prog(frame, CUE.introOut, CUE.introOut + f60(16), E.exit);
  if (out >= 1) return null;
  const u = L.u;
  const size = L.intro.markSize;
  const w = size * (GLYPH.w / GLYPH.h);
  // frame 0 is already inside the draw: the outline is a third of the way round, the ink sweeps up from f2 (ui-outline-led-reveal)
  const draw = prog(frame, CUE.markIn - f60(18), CUE.markIn + f60(12), E.out);
  const fill = prog(frame, CUE.markIn + f60(2), CUE.markIn + f60(26), E.smooth);
  // only the mark (vector) eases to rest from a touch large: a slowly scaled HTML line re-rasterises in visible steps
  const settle = lmix(1.2, 1, prog(frame, CUE.markIn - f60(12), CUE.introResolved + f60(30), E.cam));
  const lineW = 1500 * u;
  const lineSize = L.intro.lineSize;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: 1 - out, transform: `translateY(${(-30 * u * out).toFixed(2)}px)` }}>
      <svg width={w} height={size} viewBox={`0 0 ${GLYPH.w} ${GLYPH.h}`} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', transformOrigin: `${(w / 2).toFixed(2)}px ${(size * 0.56).toFixed(2)}px`, transform: `translate(${(L.W / 2 - w / 2).toFixed(2)}px, ${(L.intro.markY - size / 2).toFixed(2)}px) scale(${settle.toFixed(4)})` }}>
        <clipPath id="introFill">
          <rect x={-10} y={GLYPH.h * (1 - fill)} width={GLYPH.w + 20} height={GLYPH.h * fill + 2} />
        </clipPath>
        <path d={GLYPH.d} fill={C.ink} fillRule="evenodd" clipPath="url(#introFill)" />
        <path d={GLYPH.d} fill="none" stroke={C.ink} strokeWidth={2.2} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} opacity={1 - E.in(fill)} />
      </svg>
      <div style={{ position: 'absolute', left: 0, top: 0, width: lineW, transform: `translate(${(L.W / 2 - lineW / 2).toFixed(2)}px, ${(L.intro.lineY - (lineSize * TYPE.secondary.lead) / 2).toFixed(2)}px)` }}>
        <Typed s={SCHEDULES.intro} frame={frame} color={C.ink} size={lineSize} role="secondary" align="center" width={lineW} id="intro" />
      </div>
    </div>
  );
};

export const Session: React.FC<{ frame: number }> = ({ frame }) => {
  const { width, height } = useVideoConfig();
  const L = layoutFor(width, height);
  const u = L.u;
  const shot = shotAt(frame, L);
  const dim = 1 - 0.65 * prog(frame, CUE.dimOut, CUE.dimOut + f60(20), E.smooth);
  const hud = 1 - prog(frame, CUE.dimOut, CUE.dimOut + f60(20), E.smooth);
  const A = L.assistant;
  const avatarIn = prog(frame, CUE.label1 - f60(6), CUE.label1 + f60(6), E.smooth);
  const headerO = prog(frame, CUE.headerIn - f60(8), CUE.headerIn + f60(4), E.smooth);
  // the giant word: punches in over the drawing, then blur-swaps into the payoff bubble
  const mwP = prog(frame, CUE.mwIn, CUE.mwIn + f60(14), E.out);
  const mwQ = prog(frame, CUE.mwSwap, CUE.mwSwap + f60(6), E.in);
  const mwOn = frame >= CUE.mwIn && mwQ < 1;
  // the giant word punches in where the bubble will be (the band the constraint just left), then swaps into it
  const mwSize = TYPE.display.size * 1.1 * u;
  const mwY = A.ay + 10 * u;
  return (
    <>
      <div style={{ ...camera(shot), width: L.W, height: L.H, opacity: dim }}>
        <Diagram frame={frame} L={L} />
      </div>
      <div style={{ position: 'absolute', inset: 0, opacity: hud }}>
        <Intro frame={frame} L={L} />
        <RepoCard
          frame={frame}
          dropStart={CARD_DROP_START}
          shrink={CUE.cardShrink}
          shrinkDone={CUE.headerIn}
          box={L.card}
          pill={{ x: L.header.x, y: L.header.y, w: L.header.w, h: L.header.h }}
          u={u}
          name={copy('repoName').text}
          desc={copy('repoDesc').text}
          lang={copy('repoLang').text}
        />
        {headerO > 0 && <HeaderPill x={L.header.x} y={L.header.y} h={L.header.h} u={u} opacity={headerO} label={copy('header').text} />}
        {/* the rederive side: one avatar, the ring while it thinks, one bubble at a time */}
        {avatarIn > 0 && <Avatar x={A.ax} y={A.ay} size={44 * u} opacity={avatarIn} />}
        <ThinkingRing x={A.ax + 44 * u} y={A.ay} frame={frame} start={CUE.ring1} end={CUE.problemIn} u={u} />
        <ThinkingRing x={A.ax + 44 * u} y={A.ay} frame={frame} start={CUE.ring2} end={CUE.constraint1In} u={u} />
        <ThinkingRing x={A.ax + 44 * u} y={A.ay} frame={frame} start={CUE.ring3} end={CUE.constraint2In} u={u} />
        <AssistantBubble s={SCHEDULES.problem} frame={frame} x={A.bx} y={A.ay} maxW={A.maxW} u={u} out={CUE.ring2 - f60(6)} step={{ text: copy('step1').text, at: CUE.label1, id: 'step1' }} id="problem" />
        <AssistantBubble s={SCHEDULES.constraint1} frame={frame} x={A.bx} y={A.ay} maxW={A.maxW} u={u} out={CUE.ring3 - f60(6)} step={{ text: copy('step2').text, at: CUE.label2, id: 'step2', roll: { from: '1', to: '2' } }} id="constraint1" />
        <AssistantBubble s={SCHEDULES.constraint2} frame={frame} x={A.bx} y={A.ay} maxW={A.maxW} u={u} out={CUE.mwIn - f60(10)} step={{ text: copy('step3').text, at: CUE.label3, id: 'step3', roll: { from: '2', to: '3' } }} id="constraint2" />
        <AssistantBubble s={SCHEDULES.payoff} frame={frame} x={A.bx} y={A.ay} maxW={A.maxW} u={u} accent="middleware chain" bold="rederived" id="payoff" />
        {/* the human side: the composer, typed and sent */}
        <Composer s={SCHEDULES.cmd} frame={frame} x={L.composer.x} y={L.composer.y} w={L.composer.w} u={u} send={CUE.sendCmd} rise={CUE.composerIn} out={CUE.composerOut} id="cmd" />
        <Composer s={SCHEDULES.answer1} frame={frame} x={L.composer.x} y={L.composer.y} w={L.composer.w} u={u} send={CUE.send1} out={CUE.type2 - f60(32)} id="answer1" />
        <Composer s={SCHEDULES.answer2} frame={frame} x={L.composer.x} y={L.composer.y} w={L.composer.w} u={u} send={CUE.send2} out={CUE.type3 - f60(32)} id="answer2" />
        <Composer s={SCHEDULES.answer3} frame={frame} x={L.composer.x} y={L.composer.y} w={L.composer.w} u={u} send={CUE.send3} out={CUE.mwIn - f60(6)} id="answer3" />
        {/* the giant word */}
        {mwOn && (
          <div
            data-text="middleware"
            style={{
              ...typeStyle('display', mwSize),
              position: 'absolute',
              left: 0,
              top: 0,
              width: A.maxW,
              textAlign: 'left',
              color: C.accent,
              opacity: clamp(mwP * 2) * (1 - mwQ),
              filter: `blur(${(blurIn(mwP, 10) + blurOut(mwQ, 12)).toFixed(2)}px)`,
              transformOrigin: '0 50%',
              transform: `translate(${A.bx.toFixed(2)}px, ${(mwY - mwSize / 2).toFixed(2)}px) scale(${(lmix(1.25, 1, mwP) * lmix(1, 0.85, mwQ)).toFixed(4)})`,
            }}
          >
            middleware
          </div>
        )}
      </div>
      {/* the iris seed: the avatar stays, and an accent ring grows around it before the lockup act takes over */}
      {frame >= CUE.seed && frame < CUE.iris && (
        <>
          <Avatar x={A.ax} y={A.ay} size={44 * u} opacity={prog(frame, CUE.seed, CUE.seed + f60(8), E.smooth)} />
          <svg width={80 * u} height={80 * u} viewBox="0 0 80 80" style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${(A.ax - 40 * u).toFixed(2)}px, ${(A.ay - 40 * u).toFixed(2)}px)`, opacity: prog(frame, CUE.seed, CUE.seed + f60(6), E.smooth) }}>
            <circle cx={40} cy={40} r={(25 + 7 * Math.min(1, spr(frame, CUE.seed, SPR.firm))).toFixed(2)} fill="none" stroke={C.accent} strokeWidth={(5 * Math.min(1, spr(frame, CUE.seed, SPR.firm))).toFixed(2)} />
          </svg>
        </>
      )}
    </>
  );
};
