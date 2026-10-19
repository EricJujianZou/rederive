import React from 'react';
import { Mark } from '../brand/Mark';
import { C, FONT, TYPE, U, typeStyle } from '../brand/tokens';
import { clamp, E, prog, spr, SPR } from '../lib/anim';
import { mixColor } from '../lib/color';
import { measureTracked } from '../lib/measure';
import { TypeOn, TypeTiming } from '../fx/TypeOn';
import { f60 } from '../timeline';

// The one chat container's pieces (TREATMENT.md §3). Both panels (the interview, the real
// session) are built from the same parts, reskinned: a flat grey Avatar and no accent during the
// interview, the real ∂ Avatar and the green accent the moment the session appears. Every piece
// takes its own (x, y) in world px, scaled by U, and places itself by transform only.

export const Avatar: React.FC<{ x: number; y: number; size: number; kind: 'rederive' | 'generic'; opacity?: number }> = ({ x, y, size, kind, opacity = 1 }) => (
  <div
    style={{
      position: 'absolute',
      left: 0,
      top: 0,
      width: size,
      height: size,
      borderRadius: '50%',
      background: kind === 'rederive' ? C.paper : C.line,
      opacity,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transform: `translate(${x - size / 2}px, ${y - size / 2}px)`,
    }}
  >
    {kind === 'rederive' && <Mark size={size * 0.52} color={C.ink} />}
  </div>
);

/** A dashed ring that spins while rederive "thinks", then yields to the message it resolves into. */
export const ThinkingRing: React.FC<{ x: number; y: number; frame: number; start: number; end: number; bright?: boolean; size?: number; u?: number }> = ({ x, y, frame, start, end, bright = false, size, u = U }) => {
  size = size ?? 22 * u;
  const p = prog(frame, start, start + f60(10), E.smooth); // arrives
  const q = prog(frame, end, end + f60(10), E.in); // yields to the resolved message
  const o = p * (1 - q);
  if (o <= 0.002) return null;
  const deg = ((frame - start) * 7.5) % 360; // one turn per 48 f
  const stroke = mixColor(C.mute, C.accent, bright ? prog(frame, end - f60(8), end, E.smooth) : 0);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ position: 'absolute', left: 0, top: 0, opacity: o, transform: `translate(${x - size / 2}px, ${y - size / 2}px) rotate(${deg}deg)` }}>
      <circle cx="12" cy="12" r="9.5" fill="none" stroke={stroke} strokeWidth="2.2" strokeDasharray="30 15" strokeLinecap="round" />
    </svg>
  );
};

type Align = 'left' | 'right';

/** A message that appears whole (rederive's side: the product's own output, never typed). x is the bubble's left (align left) or right (align right) edge, y its vertical centre. */
export const Bubble: React.FC<{
  text: string;
  frame: number;
  in: number;
  x: number;
  y: number;
  align: Align;
  dim?: number; // 0 = current/full colour, 1 = relaxed to mute (an older message, per pd-terminal-burst-output)
  accent?: React.ReactNode; // optional: render with one phrase highlighted (the payoff)
  opacity?: number; // a second, independent fade: a row the camera is not framing, not an entrance
  u?: number; // the format's own UI scale (layoutFor().u); defaults to the master's fixed U
}> = ({ text, frame, in: start, x, y, align, dim = 0, accent, opacity = 1, u = U }) => {
  // align="right" assumes a maxWidth-filling box (not exercised in this film: every Bubble here
  // is align="left"; TypedBubble is the one used on the right, and it sizes to its real text).
  const s = spr(frame, start, SPR.firm); // 0..1, no overshoot: it just arrives
  const o = clamp(s * 1.6) * opacity; // reaches full opacity well before the spring settles its last pixel
  if (o <= 0.002) return null;
  const bg = align === 'left' ? C.ink2 : C.mist;
  const fg = align === 'left' ? mixColor(C.paper, C.mute, dim) : C.ink;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        maxWidth: 1040 * u,
        padding: `${16 * u}px ${20 * u}px`,
        borderRadius: 16 * u,
        background: bg,
        opacity: o,
        transform: `translate(${align === 'left' ? x : x - 1040 * u}px, ${(y - (TYPE.ui.size * u * TYPE.ui.lead) / 2 - 16 * u + (1 - s) * 10).toFixed(2)}px)`,
      }}
    >
      {/* data-text on the span, not the padded box: the box has no font-size of its own, so the
          layout audit was reading the inherited default (16px) instead of the real 26px role. */}
      <span data-text="bubble" style={{ ...typeStyle('ui', TYPE.ui.size * u), color: fg, display: 'block' }}>{accent ?? text}</span>
    </div>
  );
};

/** A message typed by a human at the keyboard (the user's side: TypeOn, human cadence, a live caret). */
export const TypedBubble: React.FC<{
  text: string;
  frame: number;
  x: number; // right edge (always align right)
  y: number;
  timing: TypeTiming;
  dim?: number;
  caretOut?: number;
  opacity?: number; // a second, independent fade: a row the camera is not framing, not an entrance
  u?: number; // the format's own UI scale (layoutFor().u); defaults to the master's fixed U
}> = ({ text, frame, x, y, timing, dim = 0, caretOut, opacity = 1, u = U }) => {
  if (frame < timing.start - f60(6)) return null;
  const grow = prog(frame, timing.start - f60(6), timing.start + f60(2), E.smooth); // the box opens just ahead of the first key
  // The box is sized to the full, finished line (not the maxWidth ceiling), so its right edge sits
  // flush against x throughout typing instead of only once the box happens to fill the ceiling.
  const { weight, track } = TYPE.ui;
  const size = TYPE.ui.size * u;
  const textW = Math.min(1000 * u, measureTracked(text, size, weight, track, FONT.mono));
  const boxW = textW + 40 * u;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: boxW,
        padding: `${16 * u}px ${20 * u}px`,
        borderRadius: 16 * u,
        background: C.mist,
        opacity: grow * opacity,
        boxSizing: 'border-box',
        transform: `translate(${x - boxW}px, ${(y - (size * TYPE.ui.lead) / 2 - 16 * u + (1 - grow) * 6).toFixed(2)}px)`,
      }}
    >
      <span style={{ ...typeStyle('ui', size) }}>
        <TypeOn text={text} frame={frame} {...timing} role="ui" size={size} caret caretColor={C.ink} caretOut={caretOut} charStyle={() => ({ color: mixColor(C.ink, C.mute, dim) })} />
      </span>
    </div>
  );
};

/** The empty reply box: a human has not answered yet. Cursor blinks; nothing is sent. x is its right edge. */
export const ReplyBox: React.FC<{ frame: number; in: number; out?: number; x: number; y: number; blink?: number; u?: number }> = ({ frame, in: start, out, x, y, blink = f60(30), u = U }) => {
  const o = prog(frame, start, start + f60(10), E.smooth) * (out !== undefined ? 1 - prog(frame, out, out + f60(8), E.in) : 1);
  if (o <= 0.002) return null;
  const on = Math.floor(Math.abs(frame - start) / blink) % 2 === 0;
  const h = TYPE.ui.size * u * TYPE.ui.lead + 32 * u;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: 220 * u,
        height: h,
        padding: `${16 * u}px ${20 * u}px`,
        borderRadius: 16 * u,
        border: `1.5px solid ${C.line}`,
        opacity: o,
        boxSizing: 'border-box',
        transform: `translate(${x - 220 * u}px, ${y - h / 2}px)`,
      }}
    >
      <span style={{ display: 'inline-block', width: 2 * u, height: TYPE.ui.size * u, background: C.mute, opacity: on ? 1 : 0 }} />
    </div>
  );
};

/** A panel's header bar: a small avatar/favicon and a label, flat grey for the interview, real for the session. */
export const Header: React.FC<{ x: number; y: number; label: string; kind: 'rederive' | 'generic'; accentPulse?: number; w: number; opacity?: number; u?: number }> = ({ x, y, label, kind, accentPulse = 0, w, opacity = 1, u = U }) => (
  <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: 64 * u, display: 'flex', alignItems: 'center', padding: `0 ${28 * u}px`, borderBottom: `1.5px solid ${C.line}`, opacity, transform: `translate(${x}px, ${y}px)`, boxSizing: 'border-box' }}>
    <Avatar x={13 * u} y={32 * u} size={26 * u} kind={kind} />
    <span style={{ ...typeStyle('mono', 20 * u), color: mixColor(C.mute, C.accent, accentPulse), marginLeft: 26 * u }}>{label}</span>
  </div>
);
