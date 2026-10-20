import React from 'react';
import { C, FONT, TYPE } from '../brand/tokens';
import { clamp, E, fd, hitPulse, mix, prog, spr, SPR } from '../lib/anim';
import { mixColor } from '../lib/color';
import { delayTo } from '../lib/sync';
import { CUE, f60 } from '../timeline';
import { CHIP, DIRECT, directX, EDGE_A, EDGE_B, RELAY, relayStart, STRAIGHT, straightHit, straightX } from './diagram-math';
import { D, Layout } from './layout';

// The drawing: the user's design, drawn live as they type it, broken by the constraint, redrawn,
// and finally resolved in the accent. Everything here is a pure function of the absolute frame.
// Drawing units; the <g> below centres and scales them (layout.diagram). The camera wraps this.

/** The server's drop starts so its spring makes contact on CUE.serverLand (landing 1 of 2). */
export const SERVER_DROP_START = CUE.serverLand - delayTo(SPR.land, 1);
/** The phones' screens pulse on the direct packets' arrival (landing 2 of 2). */
export const SCREEN_LAND_START = CUE.directLand - delayTo(SPR.land, 1);

const STROKE = 4;
const label = (): React.CSSProperties => ({ fontFamily: FONT.text, fontSize: TYPE.label.size, fontWeight: TYPE.label.weight, letterSpacing: `${TYPE.label.track}em`, fill: C.mute });

const Phone: React.FC<{ x: number; frame: number; slideFrom: number; addr?: string; addrAt: number; side: 'A' | 'B' }> = ({ x, frame, slideFrom, addr, addrAt, side }) => {
  const s = spr(frame, CUE.phonesIn, SPR.soft);
  const px = mix(slideFrom, x, s);
  // the screen lights with a waveform once the direct packets land (landing 2: SPR.land pulse)
  const land = frame >= SCREEN_LAND_START ? spr(frame, SCREEN_LAND_START, SPR.land) : 0;
  const lit = clamp(land * 1.4);
  const sc = 1 + 0.06 * (land - clamp(prog(frame, CUE.directLand, CUE.directLand + f60(16), E.out))) ;
  const chipIn = frame >= addrAt ? spr(frame, addrAt, SPR.micro) : 0;
  const w = D.phoneW;
  const h = D.phoneH;
  const bars = 5;
  return (
    <g transform={`translate(${px.toFixed(2)} 0) scale(${sc.toFixed(4)})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={18} fill={C.paper} stroke={C.ink} strokeWidth={STROKE} />
      <rect x={-w / 2 + 10} y={-h / 2 + 10} width={w - 20} height={h - 20} rx={10} fill={mixColor(C.mist, C.paper, lit)} />
      {/* the other phone's address, learned from the server */}
      {addr && chipIn > 0.01 && (
        <g opacity={clamp(chipIn * 1.5)} transform={`translate(0 ${(-h / 2 + 40 + (1 - chipIn) * 8).toFixed(2)})`}>
          <rect x={-62} y={-16} width={124} height={32} rx={16} fill={C.ink} />
          <text data-text={`addr${side}`} x={0} y={6} textAnchor="middle" style={{ fontFamily: FONT.mono, fontSize: 17, fontWeight: 450, fill: C.paper }}>
            {addr}
          </text>
        </g>
      )}
      {/* the waveform: voice arriving */}
      {lit > 0.01 &&
        Array.from({ length: bars }, (_, i) => {
          const t = (frame - CUE.directLand) / 60;
          const hgt = 12 + 36 * Math.abs(Math.sin(t * 6.5 + i * 1.3)) * lit;
          return <rect key={i} x={-34 + i * 17 - 4} y={-hgt / 2 + 24} width={8} height={hgt} rx={4} fill={C.accent} opacity={lit} />;
        })}
    </g>
  );
};

/** A home router: a box with a slot. The slot opens (splits) once an outbound packet has passed. */
const Router: React.FC<{ x: number; frame: number; openAt: number; openAgainAt: number; hitAt?: number }> = ({ x, frame, openAt, openAgainAt, hitAt }) => {
  const draw = prog(frame, CUE.phonesLand, CUE.phonesLand + f60(20), E.out);
  const w = D.routerW;
  const h = D.routerH;
  const per = 2 * (w + h);
  // open for its own packet (bar 3), closes again when the attempt is abandoned, opens for good at bar 10
  const o1 = prog(frame, openAt, openAt + f60(10), E.out) * (1 - prog(frame, CUE.send2, CUE.send2 + f60(10), E.smooth));
  const o2 = prog(frame, openAgainAt, openAgainAt + f60(10), E.out);
  const open = Math.max(o1, o2);
  const gap = 18 * open;
  const hitK = hitAt !== undefined ? hitPulse(frame - hitAt, 1, 4) : 0;
  return (
    <g transform={`translate(${x} 0) scale(${(1 + 0.05 * hitK).toFixed(4)})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={10} fill={C.paper} stroke={C.ink} strokeWidth={STROKE} strokeDasharray={per} strokeDashoffset={per * (1 - draw)} />
      {/* the slot: two halves that part when open */}
      <line x1={0} y1={-h / 2 + 16} x2={0} y2={-gap / 2 - 1} stroke={C.ink} strokeWidth={STROKE} strokeLinecap="round" opacity={draw} />
      <line x1={0} y1={gap / 2 + 1} x2={0} y2={h / 2 - 16} stroke={C.ink} strokeWidth={STROKE} strokeLinecap="round" opacity={draw} />
      {open > 0.01 && <rect x={-4} y={-gap / 2} width={8} height={gap} fill={C.accent} opacity={o2} />}
    </g>
  );
};

/** Two arcs above a router: the home network it fronts. */
const Wifi: React.FC<{ x: number; frame: number }> = ({ x, frame }) => {
  const p = prog(frame, CUE.wifi, CUE.wifi + f60(16), E.out);
  if (p <= 0) return null;
  const y = -D.routerH / 2 - 16;
  const arc = (r: number, i: number) => {
    const len = Math.PI * r * 0.5;
    const q = clamp(p * 1.4 - i * 0.4);
    return <path key={r} d={`M ${-r * 0.707} ${y - r * 0.293} A ${r} ${r} 0 0 1 ${r * 0.707} ${y - r * 0.293}`} fill="none" stroke={C.mute} strokeWidth={STROKE} strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - q)} />;
  };
  return <g transform={`translate(${x} 0)`}>{[22, 40].map(arc)}</g>;
};

const Server: React.FC<{ frame: number; y: number }> = ({ frame, y }) => {
  if (frame < SERVER_DROP_START) return null;
  const s = spr(frame, SERVER_DROP_START, SPR.land);
  const drop = mix(-220, 0, Math.min(s, 1)); // clamp: the overshoot squashes instead of sinking through the line
  const sq = s > 1 ? 1 + (s - 1) * 1.2 : 1;
  const out = prog(frame, CUE.serverOut, CUE.serverOut + f60(16), E.smooth);
  const pulse = relayPulse(frame);
  const w = D.serverW;
  const h = D.serverH;
  return (
    <g opacity={1 - out} transform={`translate(0 ${(y + drop - out * 30).toFixed(2)}) scale(${(sq * (1 + 0.03 * pulse)).toFixed(4)} ${((1 / sq) * (1 + 0.03 * pulse)).toFixed(4)})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={14} fill={C.ink} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x={-w / 2 + 18} y={-h / 2 + 18 + i * 22} width={w - 36} height={10} rx={5} fill={C.ink2} stroke={C.mute} strokeWidth={1.5} />
          <circle cx={w / 2 - 28} cy={-h / 2 + 23 + i * 22} r={3} fill={i === 1 ? C.accent : C.mute} />
        </g>
      ))}
      <text data-text="server" x={0} y={-h / 2 - 22} textAnchor="middle" style={label()}>
        server
      </text>
    </g>
  );
};

/** How hard the server is pulsing: every relayed packet passing through it. */
const relayPulse = (frame: number) => {
  let k = 0;
  for (let i = 0; i < RELAY.count; i++) {
    const mid = relayStart(i) + RELAY.dur / 2;
    if (mid > CUE.send3) break;
    k = Math.max(k, hitPulse(frame - mid, 2, 5));
  }
  return k;
};

/** A packet: one ink dot, the story device. */
const Dot: React.FC<{ x: number; y: number; color?: string; opacity?: number; sx?: number; sy?: number }> = ({ x, y, color = C.ink, opacity = 1, sx = 1, sy = 1 }) => (
  <circle r={D.packet / 2} fill={color} opacity={opacity} transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${sx.toFixed(3)} ${sy.toFixed(3)})`} />
);

/** Bar 3: three packets fly straight at router B and drop. */
const StraightPackets: React.FC<{ frame: number }> = ({ frame }) => {
  if (frame < CUE.packets1 || frame > CUE.send2) return null;
  return (
    <>
      {Array.from({ length: STRAIGHT.n }, (_, i) => {
        const hitF = straightHit(i);
        const x = straightX(i, frame);
        if (frame < CUE.packets1 + i * STRAIGHT.stagger) return null;
        if (frame < hitF) return <Dot key={i} x={x} y={0} />;
        // after the hit: squash, bounce back 60 units, fall with gravity, fade by 30 f
        const t = frame - hitF;
        const k = hitPulse(t, 1, 4);
        const bx = x - 60 * (1 - Math.exp(-t / 8));
        const by = -40 * Math.sin(Math.min(1, t / 18) * Math.PI) + 0.5 * Math.max(0, t - 10) ** 2 * 0.9;
        const o = 1 - prog(frame, hitF + f60(14), hitF + f60(30), E.smooth);
        if (o <= 0) return null;
        return <Dot key={i} x={bx} y={Math.min(by, 160)} opacity={o} sx={1 - 0.35 * k} sy={1 + 0.3 * k} />;
      })}
    </>
  );
};

/** Bars 5-8: packets through the server, alternating directions. */
const RelayPackets: React.FC<{ frame: number; serverY: number }> = ({ frame, serverY }) => {
  if (frame < CUE.packets2 || frame > CUE.send3 + f60(14)) return null;
  const fade = 1 - prog(frame, CUE.send3, CUE.send3 + f60(14), E.smooth);
  const A = { x: EDGE_A, y: 0 };
  const B = { x: EDGE_B, y: 0 };
  const S = { x: 0, y: serverY + D.serverH / 2 };
  return (
    <>
      {Array.from({ length: RELAY.count }, (_, i) => {
        const s0 = relayStart(i);
        if (frame < s0 || frame > s0 + RELAY.dur || s0 + RELAY.dur > CUE.send3 + f60(14)) return null;
        const t = (frame - s0) / RELAY.dur;
        const from = i % 2 === 0 ? A : B;
        const to = i % 2 === 0 ? B : A;
        const leg = t < 0.5 ? [from, S, t * 2] : [S, to, (t - 0.5) * 2];
        const [p, q, u] = leg as [{ x: number; y: number }, { x: number; y: number }, number];
        return <Dot key={i} x={mix(p.x, q.x, u)} y={mix(p.y, q.y, u)} opacity={fade} />;
      })}
    </>
  );
};

/** Bar 10: both phones send at once; each packet trails the direct line in the accent. */
const DirectPackets: React.FC<{ frame: number }> = ({ frame }) => {
  if (frame < DIRECT.from) return null;
  const xa = directX(frame); // the A packet, moving right
  const xb = -xa; // the B packet, moving left
  const landed = frame >= CUE.directLand;
  const fade = landed ? 1 - prog(frame, CUE.directLand, CUE.directLand + f60(10), E.smooth) : 1;
  return (
    <>
      <line x1={EDGE_A} y1={0} x2={xa} y2={0} stroke={C.accent} strokeWidth={STROKE} strokeLinecap="round" />
      <line x1={EDGE_B} y1={0} x2={xb} y2={0} stroke={C.accent} strokeWidth={STROKE} strokeLinecap="round" />
      {fade > 0 && <Dot x={xa} y={0} color={C.accent} opacity={fade} />}
      {fade > 0 && <Dot x={xb} y={0} color={C.accent} opacity={fade} />}
    </>
  );
};

/** One bright band gliding along the settled green line (cl-specular-sweep). */
const Sweep: React.FC<{ frame: number }> = ({ frame }) => {
  const p = prog(frame, CUE.sweep, CUE.sweep + f60(36), E.smooth);
  if (p <= 0 || p >= 1) return null;
  const x = mix(EDGE_A - 120, EDGE_B + 120, p);
  return (
    <g>
      <defs>
        <linearGradient id="sweepGrad" x1="0" x2="1">
          <stop offset="0" stopColor={C.paper} stopOpacity={0} />
          <stop offset="0.5" stopColor={C.paper} stopOpacity={0.85} />
          <stop offset="1" stopColor={C.paper} stopOpacity={0} />
        </linearGradient>
        <clipPath id="lineClip">
          <rect x={EDGE_A} y={-STROKE} width={EDGE_B - EDGE_A} height={STROKE * 2} />
        </clipPath>
      </defs>
      <rect clipPath="url(#lineClip)" x={x - 70} y={-STROKE} width={140} height={STROKE * 2} fill="url(#sweepGrad)" />
    </g>
  );
};

/** The "+80 ms" label with a small bar, on the lengthened detour (dn-answer-card-bars, one number). */
const Detour: React.FC<{ frame: number; serverY: number }> = ({ frame, serverY }) => {
  if (frame < CUE.detour || frame > CUE.send3 + f60(14)) return null;
  const p = spr(frame, CUE.detour, SPR.firm);
  const bar = prog(frame, CUE.detour + f60(6), CUE.detour + f60(30), E.out);
  const tick = hitPulse(frame - CUE.detourPulse, 2, 5);
  const fade = 1 - prog(frame, CUE.send3, CUE.send3 + f60(14), E.smooth);
  const x = 250;
  const y = serverY / 2 - 40;
  return (
    <g opacity={clamp(p * 1.5) * fade} transform={`translate(${x} ${(y + (1 - p) * 8).toFixed(2)}) scale(${(1 + 0.04 * tick).toFixed(4)})`}>
      <rect x={-8} y={-28} width={170} height={64} rx={14} fill={C.paper} stroke={C.line} strokeWidth={1.5} />
      <text data-text="detour" x={8} y={-2} style={{ fontFamily: FONT.text, fontSize: TYPE.label.size, fontWeight: 650, fill: C.ink, fontVariantNumeric: 'tabular-nums' }}>
        +80 ms
      </text>
      <rect x={8} y={12} width={140} height={10} rx={5} fill={C.mist} />
      <rect x={8} y={12} width={140 * 0.8 * bar} height={10} rx={5} fill={C.ink} />
    </g>
  );
};

/** The two address chips flying from the server to the phones. */
const AddressChips: React.FC<{ frame: number; serverY: number; addrA: string; addrB: string }> = ({ frame, serverY, addrA, addrB }) => {
  if (frame < CHIP.from || frame >= CHIP.to) return null;
  const p = prog(frame, CHIP.from, CHIP.to, E.inOut);
  const S = { x: 0, y: serverY };
  return (
    <>
      {[
        { to: { x: D.phoneA.x, y: -D.phoneH / 2 + 40 }, text: addrA, id: 'chipA' },
        { to: { x: D.phoneB.x, y: -D.phoneH / 2 + 40 }, text: addrB, id: 'chipB' },
      ].map(({ to, text, id }) => (
        <g key={id} transform={`translate(${mix(S.x, to.x, p).toFixed(2)} ${mix(S.y, to.y, p).toFixed(2)})`}>
          <rect x={-62} y={-16} width={124} height={32} rx={16} fill={C.ink} />
          <text data-text={id} x={0} y={6} textAnchor="middle" style={{ fontFamily: FONT.mono, fontSize: 17, fontWeight: 450, fill: C.paper }}>
            {text}
          </text>
        </g>
      ))}
    </>
  );
};

export const Diagram: React.FC<{ frame: number; L: Layout }> = ({ frame, L }) => {
  const { cx, cy, k } = L.diagram;
  const slide = 1300 / k;
  // the server sits at serverY, then slides up to serverFar on the detour beat
  const far = prog(frame, CUE.detour, CUE.detour + f60(24), E.smooth);
  const serverY = mix(L.diagram.serverY, L.diagram.serverFar, far);
  const F = fd(frame);
  // the straight attempt's line: drawn on send1, dashed and muted after the drop, gone on send2 (hard swap)
  const draw1 = prog(frame, CUE.send1, CUE.arrow1Drawn, E.out);
  const dropped = prog(frame, CUE.dropHit, CUE.dropHit + f60(8), E.smooth);
  const line1Visible = F >= CUE.send1 && F < CUE.send2;
  // relay lines: drawn on relayDrawn, gone after send3
  const draw2 = prog(frame, CUE.relayDrawn, CUE.relayDrawn + f60(16), E.out);
  const relayFade = 1 - prog(frame, CUE.send3, CUE.send3 + f60(14), E.smooth);
  const relayVisible = F >= CUE.relayDrawn && relayFade > 0;
  const labels = prog(frame, CUE.labels, CUE.labels + f60(14), E.smooth);
  const xMark = prog(frame, CUE.dropHit, CUE.dropHit + f60(6), E.out);
  const S = { x: 0, y: serverY + D.serverH / 2 };
  const legA = Math.hypot(S.x - EDGE_A, S.y);
  const legB = Math.hypot(EDGE_B - S.x, S.y);
  return (
    <svg width={L.W} height={L.H} viewBox={`0 0 ${L.W} ${L.H}`} style={{ position: 'absolute', left: 0, top: 0 }}>
      <g transform={`translate(${cx} ${cy}) scale(${k})`}>
        {/* lines sit under everything */}
        {line1Visible && (
          <g>
            <line
              x1={EDGE_A}
              y1={0}
              x2={mix(EDGE_A, D.routerB.x - D.routerW / 2, draw1)}
              y2={0}
              stroke={mixColor(C.ink, C.mute, dropped)}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={dropped > 0.5 ? '10 12' : undefined}
            />
            {xMark > 0 && (
              <g transform={`translate(${D.routerB.x - D.routerW / 2 - 22} 0)`}>
                <line x1={-10 * xMark} y1={-10 * xMark} x2={10 * xMark} y2={10 * xMark} stroke={C.ink} strokeWidth={STROKE + 1} strokeLinecap="round" />
                <line x1={10 * xMark} y1={-10 * xMark} x2={-10 * xMark} y2={10 * xMark} stroke={C.ink} strokeWidth={STROKE + 1} strokeLinecap="round" />
              </g>
            )}
          </g>
        )}
        {relayVisible && (
          <g opacity={relayFade}>
            <line x1={EDGE_A} y1={0} x2={mix(EDGE_A, S.x, draw2)} y2={mix(0, S.y, draw2)} stroke={C.ink} strokeWidth={STROKE} strokeLinecap="round" strokeDasharray={legA} />
            <line x1={S.x} y1={S.y} x2={mix(S.x, EDGE_B, draw2)} y2={mix(S.y, 0, draw2)} stroke={C.ink} strokeWidth={STROKE} strokeLinecap="round" strokeDasharray={legB} />
          </g>
        )}
        {F >= DIRECT.from && <DirectPackets frame={frame} />}
        <Sweep frame={frame} />
        <Wifi x={D.routerA.x} frame={frame} />
        <Wifi x={D.routerB.x} frame={frame} />
        <Router x={D.routerA.x} frame={frame} openAt={CUE.gateAOpen} openAgainAt={CUE.gatesOpen} />
        <Router x={D.routerB.x} frame={frame} openAt={1e9} openAgainAt={CUE.gatesOpen} hitAt={CUE.dropHit} />
        <Server frame={frame} y={serverY} />
        <Detour frame={frame} serverY={serverY} />
        <StraightPackets frame={frame} />
        <RelayPackets frame={frame} serverY={serverY} />
        <AddressChips frame={frame} serverY={serverY} addrA="198.51.100.4" addrB="203.0.113.9" />
        <Phone x={D.phoneA.x} frame={frame} slideFrom={D.phoneA.x - slide} addr="198.51.100.4" addrAt={CUE.chipsLand} side="A" />
        <Phone x={D.phoneB.x} frame={frame} slideFrom={D.phoneB.x + slide} addr="203.0.113.9" addrAt={CUE.chipsLand} side="B" />
        <g opacity={labels}>
          <text data-text="labelA" x={D.phoneA.x} y={D.phoneH / 2 + 38} textAnchor="middle" style={label()}>phone A</text>
          <text data-text="labelB" x={D.phoneB.x} y={D.phoneH / 2 + 38} textAnchor="middle" style={label()}>phone B</text>
          <text data-text="labelRA" x={D.routerA.x} y={D.routerH / 2 + 38} textAnchor="middle" style={label()}>router</text>
          <text data-text="labelRB" x={D.routerB.x} y={D.routerH / 2 + 38} textAnchor="middle" style={label()}>router</text>
        </g>
      </g>
    </svg>
  );
};
