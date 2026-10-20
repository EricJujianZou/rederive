import React from 'react';
import { useVideoConfig } from 'remotion';
import { C, TYPE, typeStyle } from '../brand/tokens';
import { blurIn, blurOut, clamp, E, lmix, prog, spr, SPR } from '../lib/anim';
import { camera, Shot } from '../lib/camera';
import { copy, CUE, f60 } from '../timeline';
import { AssistantBubble, Avatar, Chip, Composer, HeaderPill, ThinkingRing } from '../ui/Chat';
import { Diagram } from '../ui/Diagram';
import { D, layoutFor } from '../ui/layout';
import { SCHEDULES } from '../ui/typing';

// The whole session as one continuous take on the absolute frame. Acts 1 and 2 both render this;
// the lockup act renders it under the iris. The camera moves the drawing only; the chat is a HUD.

/** The camera on the drawing: k and the world point it frames, per absolute frame. */
export const shotAt = (frame: number, L: ReturnType<typeof layoutFor>): Shot => {
  const { cx, cy, k } = L.diagram;
  const routerB = { x: cx + D.routerB.x * k, y: cy };
  const home: Shot = { ax: cx, ay: cy, sx: cx, sy: cy, k: 1 };
  // push 1: on router B as the packet drops; back out as the constraint is read
  const p1 = prog(frame, CUE.pushIn - f60(6), CUE.pushIn + f60(44), E.cam);
  const r1 = prog(frame, CUE.pullOut, CUE.pullOut + f60(40), E.cam);
  // push 2: on the green line as the packets land; back out for the chips
  const p2 = prog(frame, CUE.pushIn2 - f60(4), CUE.pushIn2 + f60(36), E.cam);
  const r2 = prog(frame, CUE.pullOut2, CUE.pullOut2 + f60(40), E.cam);
  const z1 = p1 * (1 - r1);
  const z2 = p2 * (1 - r2);
  const breath = 1 + 0.02 * Math.sin((frame / 60) * 0.9);
  // the hook settles: the canvas opens a touch wide and eases to rest over bar 1 (frame 0 already moves)
  const settle = lmix(1.08, 1, prog(frame, 0, CUE.problemResolved, E.cam));
  const k1 = lmix(1, 1.4, z1) * lmix(1, 1.12, z2) * breath * settle;
  // the anchor blends toward router B during push 1 (screen point stays where router B sits, shifted toward centre)
  const ax = cx + (routerB.x - cx) * z1;
  const sx = cx + (routerB.x - cx) * z1 * 0.55;
  return { ...home, ax, ay: cy + (routerB.y - cy) * z1, sx, sy: cy, k: k1 };
};

export const Session: React.FC<{ frame: number }> = ({ frame }) => {
  const { width, height } = useVideoConfig();
  const L = layoutFor(width, height);
  const u = L.u;
  const shot = shotAt(frame, L);
  const dim = 1 - 0.65 * prog(frame, CUE.dimOut, CUE.dimOut + f60(20), E.smooth);
  const hud = 1 - prog(frame, CUE.dimOut, CUE.dimOut + f60(20), E.smooth);
  const A = L.assistant;
  const ringY = A.ay;
  // the giant ICE: punches in over the drawing, then blur-swaps into the payoff bubble
  const iceP = prog(frame, CUE.iceIn, CUE.iceIn + f60(14), E.out);
  const iceQ = prog(frame, CUE.iceSwap, CUE.iceSwap + f60(6), E.in);
  const iceOn = frame >= CUE.iceIn && iceQ < 1;
  const iceSize = TYPE.display.size * 1.6 * u;
  const iceY = L.diagram.cy + (L.diagram.serverY - 20) * L.diagram.k;
  return (
    <>
      <div style={{ ...camera(shot), width: L.W, height: L.H, opacity: dim }}>
        <Diagram frame={frame} L={L} />
      </div>
      <div style={{ position: 'absolute', inset: 0, opacity: hud }}>
        <HeaderPill x={L.header.x} y={L.header.y} h={L.header.h} u={u} label={copy('header').text} />
        {/* the rederive side: one avatar, the ring while it thinks, one bubble at a time */}
        <Avatar x={A.ax} y={A.ay} size={44 * u} />
        <ThinkingRing x={A.ax + 44 * u} y={ringY} frame={frame} start={CUE.ring1} end={CUE.problemIn} u={u} />
        <ThinkingRing x={A.ax + 44 * u} y={ringY} frame={frame} start={CUE.ring2} end={CUE.constraint1In} u={u} />
        <ThinkingRing x={A.ax + 44 * u} y={ringY} frame={frame} start={CUE.ring3} end={CUE.constraint2In} u={u} />
        <AssistantBubble s={SCHEDULES.problem} frame={frame} x={A.bx} y={A.ay} maxW={A.maxW} u={u} out={CUE.ring2 - f60(6)} id="problem" />
        <AssistantBubble s={SCHEDULES.constraint1} frame={frame} x={A.bx} y={A.ay} maxW={A.maxW} u={u} out={CUE.ring3 - f60(6)} id="constraint1" />
        <AssistantBubble s={SCHEDULES.constraint2} frame={frame} x={A.bx} y={A.ay} maxW={A.maxW} u={u} out={CUE.iceIn - f60(10)} id="constraint2" />
        <AssistantBubble s={SCHEDULES.payoff} frame={frame} x={A.bx} y={A.ay} maxW={A.maxW} u={u} accent="ICE" id="payoff" />
        {/* the human side: the composer, typed and sent */}
        <Composer s={SCHEDULES.answer1} frame={frame} x={L.composer.x} y={L.composer.y} w={L.composer.w} u={u} send={CUE.send1} out={CUE.type2 - f60(32)} id="answer1" />
        <Composer s={SCHEDULES.answer2} frame={frame} x={L.composer.x} y={L.composer.y} w={L.composer.w} u={u} send={CUE.send2} out={CUE.type3 - f60(32)} id="answer2" />
        <Composer s={SCHEDULES.answer3} frame={frame} x={L.composer.x} y={L.composer.y} w={L.composer.w} u={u} send={CUE.send3} out={CUE.chip1 - f60(10)} id="answer3" />
        {/* the giant word */}
        {iceOn && (
          <div
            data-text="ice"
            style={{
              ...typeStyle('display', iceSize),
              position: 'absolute',
              left: 0,
              top: 0,
              width: 600 * u,
              textAlign: 'center',
              color: C.accent,
              opacity: clamp(iceP * 2) * (1 - iceQ),
              filter: `blur(${(blurIn(iceP, 10) + blurOut(iceQ, 12)).toFixed(2)}px)`,
              transform: `translate(${(L.W / 2 - 300 * u).toFixed(2)}px, ${(iceY - iceSize / 2).toFixed(2)}px) scale(${(lmix(1.25, 1, iceP) * lmix(1, 0.85, iceQ)).toFixed(4)})`,
            }}
          >
            ICE
          </div>
        )}
        {/* the next problems, around the drawing */}
        {(['next1', 'next2', 'next3', 'next4'] as const).map((id, i) => {
          const at = [CUE.chip1, CUE.chip2, CUE.chip3, CUE.chip4][i];
          const o = L.chips[i];
          return <Chip key={id} text={copy(id).text} x={L.diagram.cx + o.x * L.diagram.k} y={L.diagram.cy + o.y * L.diagram.k} frame={frame} start={at} u={u} id={id} />;
        })}
      </div>
      {/* the iris seed: the accent dot grows on the avatar before the lockup act takes over */}
      {frame >= CUE.seed && frame < CUE.iris && <Avatar x={A.ax} y={A.ay} size={44 * u} opacity={prog(frame, CUE.seed, CUE.seed + f60(8), E.smooth)} ring={spr(frame, CUE.seed, SPR.firm)} />}
    </>
  );
};
