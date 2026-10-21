import React from 'react';
import { C, FONT, TYPE } from '../brand/tokens';
import { clamp, E, fd, hitPulse, mix, prog, spr, SPR } from '../lib/anim';
import { mixColor } from '../lib/color';
import { CUE, f60 } from '../timeline';
import {
  BOX_DROP_LEAD, BOX_ORDER, boxAt, breachDotAt, BROWSER_EXIT, chainDotAt, CHAIN_LAND_START, CHAIN_ROW, countAt, ENTRANCE, firstDotAt, FIRST_ROW, GATE, GATE_DROP_START,
  liftFrom, liftP, noTokenDotAt, ROUTES, scrollAt, tokenDotAt,
} from './diagram-math';
import { D, Layout, SV } from './layout';

// The drawing: the user's design, drawn live as they type it, broken by the constraint, redrawn,
// and finally resolved in the accent. Everything here is a pure function of the absolute frame.
// Drawing units; the <g> below centres and scales them (layout.diagram). The camera wraps this.

const STROKE = 4;
const label = (): React.CSSProperties => ({ fontFamily: FONT.text, fontSize: TYPE.label.size, fontWeight: TYPE.label.weight, letterSpacing: `${TYPE.label.track}em`, fill: C.mute });
const mono = (size: number, fill: string): React.CSSProperties => ({ fontFamily: FONT.mono, fontSize: size, fontWeight: TYPE.mono.weight, fill, fontVariantNumeric: 'tabular-nums' });

/** How green the design is: 0 until the chain's request lands, 1 twelve frames later. */
const greenAt = (frame: number) => prog(frame, CUE.chainLand, CUE.chainLand + f60(12), E.out);

/** A padlock in the brand's stroke: a body and a shackle. About 26 units tall, centred on its body. */
const Lock: React.FC<{ x: number; y: number; scale?: number; opacity?: number; color?: string }> = ({ x, y, scale = 1, opacity = 1, color = C.ink }) => (
  <g opacity={opacity} transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(3)})`}>
    <path d="M -6 -4 V -9 A 6 6 0 0 1 6 -9 V -4" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" />
    <rect x={-9} y={-4} width={18} height={14} rx={3} fill={color} />
  </g>
);

/** The browser window: a frame, a top strip with an address pill, two lines of page. Slides in from the left. */
const Browser: React.FC<{ frame: number }> = ({ frame }) => {
  const s = frame < CUE.drawIn ? 0 : spr(frame, CUE.drawIn, SPR.soft);
  const { x, w, h } = D.browser;
  const px = mix(x - 560, x, s); // from just outside the frame edge, so the soft spring peaks under 80 px/f (clean blur)
  return (
    <g transform={`translate(${px.toFixed(2)} 0)`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={16} fill={C.paper} stroke={C.ink} strokeWidth={STROKE} />
      <rect x={-w / 2 + 2} y={-h / 2 + 2} width={w - 4} height={34} rx={13} fill={C.mist} />
      <rect x={-w / 2 + 2} y={-h / 2 + 24} width={w - 4} height={12} fill={C.mist} />
      <rect x={-w / 2 + 44} y={-h / 2 + 11} width={w - 88} height={16} rx={8} fill={C.paper} />
      <rect x={-w / 2 + 28} y={-h / 2 + 64} width={w - 56} height={12} rx={6} fill={C.mist} />
      <rect x={-w / 2 + 28} y={-h / 2 + 92} width={w - 120} height={12} rx={6} fill={C.mist} />
      <rect x={-w / 2 + 28} y={-h / 2 + 128} width={96} height={30} rx={8} fill={C.ink} opacity={0.9} />
    </g>
  );
};

/** One route row: a method and a path in the mono, a lock at the left once the design has one, a handler at the right. */
const Row: React.FC<{ i: number; frame: number; y: number }> = ({ i, frame, y }) => {
  const open = i === D.openRow;
  const text = ROUTES[i];
  const sp = text.indexOf(' ');
  // the first five rows outline, then fill, 6 f apart (ui-outline-led-reveal); the rest are simply there
  const t0 = CUE.routesIn + f60(6) * Math.min(i, 4);
  const draw = i < D.rowsVisible ? prog(frame, t0, t0 + f60(14), E.out) : 1;
  const fill = i < D.rowsVisible ? prog(frame, t0 + f60(8), t0 + f60(18), E.smooth) : 1;
  if (draw <= 0) return null;
  const w = SV.rowRight - SV.rowLeft;
  // the lock: snaps on at locksIn (6 f apart on the visible rows), lifts away on locksLift
  const lockAt = CUE.locksIn + f60(6) * Math.min(i, 4);
  const lockIn = frame < lockAt ? 0 : spr(frame, lockAt, SPR.micro);
  const lifted = liftP(i, frame) > 0;
  // the handler: fills ink when a request reaches it; the chain's row turns green
  const litFirst = i === FIRST_ROW ? hitPulse(frame - CUE.handler1, 1, 5) : 0;
  const litBreach = open ? hitPulse(frame - CUE.breachHit, 1, 5) : 0;
  const litToken = i === CHAIN_ROW ? hitPulse(frame - CUE.handler2, 1, 5) : 0;
  const green = i === CHAIN_ROW ? greenAt(frame) : 0;
  const filledAt = i === FIRST_ROW ? CUE.handler1 : open ? CUE.breachHit : i === CHAIN_ROW ? CUE.handler2 : Infinity;
  const filled = fd(frame) >= filledAt ? 1 : 0;
  const pulse = Math.max(litFirst, litBreach, litToken);
  const landK = i === CHAIN_ROW && frame >= CHAIN_LAND_START ? spr(frame, CHAIN_LAND_START, SPR.land) : 0;
  // the breach: the row's outline thickens in ink and the row shakes once
  const breach = open ? prog(frame, CUE.breachHit, CUE.breachHit + f60(6), E.out) : 0;
  const shake = open ? 4 * hitPulse(frame - CUE.breachHit, 1, 6) * Math.sin((frame - CUE.breachHit) * 1.9) : 0;
  // the missing lock: a dashed ring where the lock should be, drawn as the open row arrives
  const ring = open ? prog(frame, CUE.scrollEnd - f60(10), CUE.scrollEnd + f60(4), E.out) * (1 - prog(frame, CUE.locksLift, CUE.locksLift + f60(12), E.smooth)) : 0;
  const hx = SV.handlerX;
  const handlerFill = green > 0 ? mixColor(C.ink, C.accent, green) : C.ink;
  return (
    <g transform={`translate(${shake.toFixed(2)} ${y.toFixed(2)})`} opacity={clamp(draw * 1.5)}>
      <rect x={SV.rowLeft} y={-D.row.h / 2} width={w} height={D.row.h} rx={10} fill={C.mist} opacity={fill * (1 - breach)} />
      <rect
        x={SV.rowLeft}
        y={-D.row.h / 2}
        width={w}
        height={D.row.h}
        rx={10}
        fill="none"
        stroke={breach > 0 ? C.ink : C.line}
        strokeWidth={breach > 0 ? 2 + 2.5 * breach : 2}
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - draw}
        opacity={breach > 0 ? 1 : 1 - fill * 0.4}
      />
      <text data-text={i < D.rowsVisible ? `route${i}` : open ? 'routeOpen' : undefined} x={SV.rowLeft + 50} y={8} style={mono(22, C.ink)} opacity={fill}>
        <tspan fill={C.mute}>{text.slice(0, sp)}</tspan>
        <tspan x={SV.rowLeft + 50 + 14 * (sp + 1)}>{text.slice(sp + 1)}</tspan>
      </text>
      {!open && lockIn > 0.01 && !lifted && <Lock x={SV.lockX} y={0} scale={clamp(lockIn)} />}
      {ring > 0.01 && <circle cx={SV.lockX} cy={0} r={12} fill="none" stroke={C.mute} strokeWidth={2.5} strokeDasharray="5 5" pathLength={1} strokeDashoffset={0} opacity={ring} />}
      <g transform={`translate(${hx} 0) scale(${(1 + 0.12 * pulse + 0.1 * Math.min(landK, 1.2)).toFixed(4)})`}>
        <rect x={-13} y={-13} width={26} height={26} rx={7} fill={filled ? handlerFill : C.paper} stroke={green > 0 ? mixColor(C.ink, C.accent, green) : C.ink} strokeWidth={3} opacity={fill} />
      </g>
      {/* the dash burst around the handler the chain reaches (mi-radial-dash-burst), once */}
      {i === CHAIN_ROW && frame >= CUE.chainLand && frame < CUE.chainLand + f60(22) && <Burst x={hx} y={0} t={(frame - CUE.chainLand) / f60(22)} />}
    </g>
  );
};

const Burst: React.FC<{ x: number; y: number; t: number }> = ({ x, y, t }) => {
  const grow = E.out(clamp(t));
  const fade = 1 - E.in(clamp((t - 0.4) / 0.6));
  return (
    <g transform={`translate(${x} ${y})`} opacity={fade}>
      {Array.from({ length: 8 }, (_, k) => {
        const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
        const r0 = 22 + 26 * grow;
        const r1 = r0 + 10 + 6 * (1 - grow);
        return <line key={k} x1={Math.cos(a) * r0} y1={Math.sin(a) * r0} x2={Math.cos(a) * r1} y2={Math.sin(a) * r1} stroke={C.accent} strokeWidth={3.5} strokeLinecap="round" />;
      })}
    </g>
  );
};

/** The routes counter: a label and a two-digit reel that detents from 5 to 40 as the list scrolls. */
const Counter: React.FC<{ frame: number }> = ({ frame }) => {
  const v = countAt(frame);
  const size = 24;
  const h = size * 1.1;
  const x = SV.right - D.server.pad;
  const y = -D.server.h / 2 + D.server.pad + 12;
  const digit = (pos: number, k: number) => (
    <g key={k} transform={`translate(${(x - 14 * (1 - k) - 4).toFixed(2)} ${y.toFixed(2)})`}>
      <clipPath id={`reel${k}`}>
        <rect x={-10} y={-h * 0.62} width={20} height={h * 1.22} />
      </clipPath>
      <g clipPath={`url(#reel${k})`}>
        {[-1, 0, 1].map((o) => {
          const d = ((Math.floor(pos) + o) % 10 + 10) % 10;
          const dy = (o - (pos - Math.floor(pos))) * h;
          return (
            <text key={o} x={0} y={dy + size * 0.36} textAnchor="middle" style={mono(size, C.ink)}>
              {d}
            </text>
          );
        })}
      </g>
    </g>
  );
  // the ones column detents on each integer; the tens column turns only while the ones wrap from 9 to 0
  const ones = Math.floor(v) % 10;
  const fr = v - Math.floor(v);
  const snap = E.out(fr);
  const onesPos = Math.floor(v) + snap;
  const tens = Math.floor(v / 10);
  const tensPos = tens + (ones === 9 ? snap : 0);
  const showTens = v >= 9.5;
  return (
    <g>
      <text data-text="counter" x={x - 40} y={y + size * 0.36} textAnchor="end" style={label()}>
        routes
      </text>
      {showTens && digit(tensPos, 0)}
      {digit(onesPos, 1)}
    </g>
  );
};

/** The server: a tall box with a counter strip at the top and the route list in a viewport beneath it. */
const Server: React.FC<{ frame: number }> = ({ frame }) => {
  const s = frame < CUE.drawIn ? 0 : spr(frame, CUE.drawIn, SPR.soft);
  const { x, w, h } = D.server;
  const px = mix(x + 560, x, s);
  const scroll = scrollAt(frame);
  const rows = Array.from({ length: D.routes }, (_, i) => i).filter((i) => {
    const y = SV.rowY(i, scroll);
    return y > SV.top - D.row.h && y < SV.bottom + D.row.h;
  });
  return (
    <g transform={`translate(${(px - x).toFixed(2)} 0)`}>
      <rect x={x - w / 2} y={-h / 2} width={w} height={h} rx={18} fill={C.paper} stroke={C.ink} strokeWidth={STROKE} />
      <line x1={SV.left + 2} y1={SV.top - 8} x2={SV.right - 2} y2={SV.top - 8} stroke={C.line} strokeWidth={1.5} />
      <text data-text="labelServer" x={SV.left + D.server.pad} y={-h / 2 + D.server.pad + 12 + 24 * 0.36} style={label()} opacity={prog(frame, CUE.labelsIn, CUE.labelsIn + f60(14), E.smooth)}>
        server
      </text>
      <Counter frame={frame} />
      <clipPath id="routesClip">
        <rect x={SV.left + 2} y={SV.top} width={w - 4} height={SV.bottom - SV.top} />
      </clipPath>
      <g clipPath="url(#routesClip)">
        {rows.map((i) => (
          <Row key={i} i={i} frame={frame} y={SV.rowY(i, scroll)} />
        ))}
      </g>
    </g>
  );
};

/** The forty locks leaving their rows and streaming into the gate (tr-subtract-reveal). */
const LiftingLocks: React.FC<{ frame: number }> = ({ frame }) => {
  if (frame < CUE.locksLift || frame > CUE.gateLand + f60(10)) return null;
  return (
    <>
      {Array.from({ length: D.routes }, (_, i) => {
        if (i === D.openRow) return null;
        const p = liftP(i, frame);
        if (p <= 0 || p >= 1) return null;
        const from = liftFrom(i);
        const bow = -40 * Math.sin(Math.PI * p);
        return <Lock key={i} x={mix(from.x, GATE.x, p)} y={mix(from.y, GATE.y, p) + bow} scale={mix(1, 0.6, p)} opacity={1 - E.in(clamp((p - 0.7) / 0.3))} />;
      })}
    </>
  );
};

/** A box with a job: auth (the gate, with its lock), log, parse, rate limit. */
const Box: React.FC<{ name: keyof typeof BOX_ORDER; frame: number; at: number; text: string; id: string }> = ({ name, frame, at, text, id }) => {
  const dropStart = name === 'auth' ? GATE_DROP_START : at - BOX_DROP_LEAD;
  if (frame < dropStart) return null;
  // the gate is a true landing (overshoot, landing 1 of 2); the other boxes arrive firm
  const s = spr(frame, dropStart, name === 'auth' ? SPR.land : SPR.firm);
  const drop = mix(-160, 0, Math.min(s, 1));
  const sq = s > 1 ? 1 + (s - 1) * 1.0 : 1;
  const fadeIn = prog(frame, dropStart, dropStart + f60(6), E.smooth);
  const p = boxAt(name, frame);
  const green = greenAt(frame);
  const stroke = mixColor(C.ink, C.accent, green);
  // each box pulses as the chain's request passes through it
  const passAt = [CUE.chain1, CUE.chain2, CUE.chain3, CUE.chain4][BOX_ORDER[name]];
  const pulse = hitPulse(frame - passAt, 1, 5);
  const { w, h } = D.box;
  return (
    <g opacity={fadeIn} transform={`translate(${p.x.toFixed(2)} ${(p.y + drop).toFixed(2)}) scale(${(sq * (1 + 0.06 * pulse)).toFixed(4)} ${((1 / sq) * (1 + 0.06 * pulse)).toFixed(4)})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={12} fill={C.paper} stroke={stroke} strokeWidth={STROKE} />
      {name === 'auth' ? (
        <>
          <Lock x={-w / 2 + 24} y={2} scale={0.8} color={stroke} />
          <text data-text={id} x={-w / 2 + 42} y={7} style={mono(18, stroke)}>
            {text}
          </text>
        </>
      ) : (
        <text data-text={id} x={0} y={7} textAnchor="middle" style={mono(18, stroke)}>
          {text}
        </text>
      )}
    </g>
  );
};

/** A request: one ink dot, the story device. */
const Dot: React.FC<{ p: { x: number; y: number }; color?: string; opacity?: number; sx?: number; sy?: number; ring?: boolean; pulse?: number }> = ({ p, color = C.ink, opacity = 1, sx = 1, sy = 1, ring = false, pulse = 0 }) => (
  <g transform={`translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) scale(${(sx * (1 + 0.08 * pulse)).toFixed(3)} ${(sy * (1 + 0.08 * pulse)).toFixed(3)})`} opacity={opacity}>
    {ring && <circle r={D.dot / 2 + 7} fill="none" stroke={color} strokeWidth={2.5} />}
    <circle r={D.dot / 2} fill={color} />
  </g>
);

/** The request's line from the browser to the server, through the chain once it exists; green at the end. */
const Line: React.FC<{ frame: number }> = ({ frame }) => {
  const draw = prog(frame, CUE.dotWait, CUE.dotWaiting, E.out);
  if (draw <= 0) return null;
  const green = greenAt(frame);
  const thick = 2.5 + 2 * green + 4 * hitPulse(frame - CUE.chainLand, 2, 6);
  const x1 = BROWSER_EXIT.x;
  const x2 = mix(x1, ENTRANCE.x, draw);
  return <line x1={x1} y1={0} x2={x2} y2={0} stroke={mixColor(C.line, C.accent, green)} strokeWidth={thick} strokeLinecap="round" />;
};

/** Chevrons between the lined-up boxes: each function calls the next. */
const Chevrons: React.FC<{ frame: number }> = ({ frame }) => {
  const p = prog(frame, CUE.lineUpDone, CUE.lineUpDone + f60(14), E.out);
  if (p <= 0) return null;
  const green = greenAt(frame);
  const col = mixColor(C.mute, C.accent, green);
  const xs = D.chainX;
  return (
    <g opacity={p}>
      {xs.slice(0, 3).map((x, k) => {
        const mx = (x + xs[k + 1]) / 2;
        return <path key={k} d={`M ${mx - 4} -7 L ${mx + 3} 0 L ${mx - 4} 7`} fill="none" stroke={col} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" transform={`translate(${(-6 * (1 - p)).toFixed(2)} 0)`} />;
      })}
    </g>
  );
};

/** One bright band gliding along the settled green line (cl-specular-sweep). */
const Sweep: React.FC<{ frame: number }> = ({ frame }) => {
  const p = prog(frame, CUE.sweep, CUE.sweep + f60(36), E.smooth);
  if (p <= 0 || p >= 1) return null;
  const x = mix(BROWSER_EXIT.x - 100, ENTRANCE.x + 100, p);
  return (
    <g>
      <defs>
        <linearGradient id="sweepGrad" x1="0" x2="1">
          <stop offset="0" stopColor={C.paper} stopOpacity={0} />
          <stop offset="0.5" stopColor={C.paper} stopOpacity={0.85} />
          <stop offset="1" stopColor={C.paper} stopOpacity={0} />
        </linearGradient>
        <clipPath id="lineClip">
          <rect x={BROWSER_EXIT.x} y={-5} width={ENTRANCE.x - BROWSER_EXIT.x} height={10} />
        </clipPath>
      </defs>
      <rect clipPath="url(#lineClip)" x={x - 70} y={-5} width={140} height={10} fill="url(#sweepGrad)" />
    </g>
  );
};

export const Diagram: React.FC<{ frame: number; L: Layout }> = ({ frame, L }) => {
  const { cx, cy, k } = L.diagram;
  const F = fd(frame);
  const push1 = prog(frame, CUE.pushIn - f60(6), CUE.pushIn + f60(14), E.smooth) * (1 - prog(frame, CUE.pullOut + f60(10), CUE.pullOut + f60(40), E.smooth));
  const push2 = prog(frame, CUE.pushIn2 - f60(4), CUE.pushIn2 + f60(14), E.smooth) * (1 - prog(frame, CUE.pullOut2 + f60(10), CUE.pullOut2 + f60(40), E.smooth));
  const labels = prog(frame, CUE.labelsIn, CUE.labelsIn + f60(14), E.smooth) * (1 - Math.max(push1, push2));
  const first = firstDotAt(frame);
  const firstFade = 1 - prog(frame, CUE.handler1 + f60(4), CUE.handler1 + f60(16), E.smooth);
  const waiting = F >= CUE.dotWaiting && F < CUE.dotEnter ? hitPulse(((frame - CUE.dotWaiting) % 30), 6, 10) : 0;
  const breach = breachDotAt(frame);
  const breachFade = 1 - prog(frame, CUE.breachHit + f60(4), CUE.breachHit + f60(16), E.smooth);
  const token = tokenDotAt(frame);
  const tokenFade = 1 - prog(frame, CUE.handler2 + f60(4), CUE.handler2 + f60(16), E.smooth);
  const noToken = noTokenDotAt(frame);
  const chain = chainDotAt(frame);
  const chainFade = 1 - prog(frame, CUE.chainLand + f60(4), CUE.chainLand + f60(16), E.smooth);
  const green = greenAt(frame);
  return (
    <svg width={L.W} height={L.H} viewBox={`0 0 ${L.W} ${L.H}`} style={{ position: 'absolute', left: 0, top: 0 }}>
      <g transform={`translate(${cx} ${cy}) scale(${k})`}>
        <Line frame={frame} />
        <Sweep frame={frame} />
        <Browser frame={frame} />
        <Server frame={frame} />
        <Chevrons frame={frame} />
        <LiftingLocks frame={frame} />
        <Box name="log" frame={frame} at={CUE.logIn} text="log" id="boxLog" />
        <Box name="parse" frame={frame} at={CUE.parseIn} text="parse" id="boxParse" />
        <Box name="auth" frame={frame} at={CUE.gateLand} text="auth" id="gate" />
        <Box name="rate" frame={frame} at={CUE.rateIn} text="rate limit" id="boxRate" />
        {first && firstFade > 0 && <Dot p={first} opacity={firstFade} pulse={waiting} />}
        {breach && breachFade > 0 && <Dot p={breach} opacity={breachFade} />}
        {token && tokenFade > 0 && <Dot p={token} opacity={tokenFade} ring />}
        {noToken && <Dot p={noToken.p} opacity={noToken.opacity} sx={1 + 0.3 * noToken.squash} sy={1 - 0.35 * noToken.squash} />}
        {chain && chainFade > 0 && <Dot p={chain} opacity={chainFade} ring color={mixColor(C.ink, C.accent, green)} />}
        <g opacity={labels}>
          <text data-text="labelBrowser" x={D.browser.x} y={D.browser.h / 2 + 38} textAnchor="middle" style={label()}>browser</text>
        </g>
      </g>
    </svg>
  );
};
