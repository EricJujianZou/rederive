import React from 'react';
import { Mark } from '../brand/Mark';
import { C, TYPE, typeStyle } from '../brand/tokens';
import { clamp, E, fd, prog, spr, SPR } from '../lib/anim';
import { mixColor } from '../lib/color';
import { f60 } from '../timeline';
import { Schedule, shownAt } from './typing';

// The chat layer (a HUD above the drawing: the camera never moves it). One rederive bubble at the
// top, one composer or sent line at the bottom. Every piece places itself by transform only.

export const Avatar: React.FC<{ x: number; y: number; size: number; opacity?: number; ring?: number }> = ({ x, y, size, opacity = 1, ring = 0 }) => (
  <div
    data-text="avatar"
    style={{
      position: 'absolute',
      left: 0,
      top: 0,
      width: size,
      height: size,
      borderRadius: '50%',
      background: C.ink,
      opacity,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: ring > 0 ? `0 0 0 ${(3 * ring).toFixed(2)}px ${C.accent}` : undefined,
      transform: `translate(${x - size / 2}px, ${y - size / 2}px)`,
    }}
  >
    <Mark size={size * 0.54} color={C.paper} />
  </div>
);

/** A dashed ring that spins while rederive thinks, then yields to the message. */
export const ThinkingRing: React.FC<{ x: number; y: number; frame: number; start: number; end: number; u: number }> = ({ x, y, frame, start, end, u }) => {
  const size = 26 * u;
  const p = prog(frame, start, start + f60(10), E.smooth);
  const q = prog(frame, end, end + f60(8), E.in);
  const o = p * (1 - q);
  if (o <= 0.002) return null;
  const deg = ((frame - start) * 7.5) % 360;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ position: 'absolute', left: 0, top: 0, opacity: o, transform: `translate(${x - size / 2}px, ${y - size / 2}px) rotate(${deg.toFixed(2)}deg)` }}>
      <circle cx="12" cy="12" r="9.5" fill="none" stroke={C.mute} strokeWidth="2.4" strokeDasharray="30 15" strokeLinecap="round" />
    </svg>
  );
};

/**
 * Text that appears unit by unit (characters for a human, words for the product). The whole line
 * is laid out from the first frame with the unshown part transparent, so wrapping never shifts
 * and the caret sits inline after the last shown character.
 */
export const Typed: React.FC<{
  s: Schedule;
  frame: number;
  color: string;
  caret?: boolean;
  caretOut?: number;
  accent?: string; // a phrase set in the accent once shown
  size: number;
  width?: number;
  id: string;
}> = ({ s, frame, color, caret = false, caretOut, accent, size, width, id }) => {
  const units = s.mode === 'word' ? s.text.split(' ') : s.text.split('');
  const n = shownAt(s, frame);
  const F = fd(frame);
  const typing = n > 0 && n < units.length;
  const blinkOn = typing || Math.floor(Math.abs(F - s.end) / f60(30)) % 2 === 0;
  const showCaret = caret && F >= s.start - f60(6) && (caretOut === undefined || F < caretOut);
  let accentFrom = -1;
  let accentTo = -1;
  if (accent) {
    const i = s.text.indexOf(accent);
    if (i >= 0) {
      if (s.mode === 'char') {
        accentFrom = i;
        accentTo = i + accent.length;
      } else {
        accentFrom = s.text.slice(0, i).split(' ').length - 1;
        accentTo = accentFrom + accent.split(' ').length;
      }
    }
  }
  return (
    <span data-text={id} style={{ ...typeStyle('ui', size), whiteSpace: 'pre-wrap', display: 'block', width, color }}>
      {units.map((t, i) => {
        const shown = i < n;
        const age = shown ? F - unitFrame(s, i) : 0;
        const o = shown ? clamp((age + 1) / 4) : 0;
        const inAccent = i >= accentFrom && i < accentTo;
        return (
          <React.Fragment key={i}>
            {i === n && showCaret && <Caret color={color} size={size} on={blinkOn} />}
            <span style={{ opacity: o, color: inAccent ? C.accent : undefined, fontWeight: inAccent ? 650 : undefined }}>{t}</span>
            {s.mode === 'word' && i < units.length - 1 ? <span style={{ opacity: o }}> </span> : null}
          </React.Fragment>
        );
      })}
      {n >= units.length && showCaret && <Caret color={color} size={size} on={blinkOn} />}
    </span>
  );
};

// First frame unit i shows (inverse of shownAt, cheap: the schedule is monotone).
const cache = new Map<string, number[]>();
const unitFrame = (s: Schedule, i: number) => {
  const key = `${s.text}|${s.start}|${s.end}|${s.mode}`;
  let at = cache.get(key);
  if (!at) {
    at = [];
    const n = s.mode === 'word' ? s.text.split(' ').length : s.text.length;
    for (let F = s.start; F <= s.end + 120 && at.length < n; F++) while (at.length < shownAt(s, F)) at.push(F);
    while (at.length < n) at.push(s.end);
    cache.set(key, at);
  }
  return at[i] ?? s.end;
};

const Caret: React.FC<{ color: string; size: number; on: boolean }> = ({ color, size, on }) => (
  <span style={{ display: 'inline-block', width: 2.5, height: size * 0.95, verticalAlign: 'text-bottom', background: color, opacity: on ? 1 : 0, marginRight: 1 }} />
);

/** The rederive bubble: avatar, light surface, streamed words. Enters by rising 10 px; exits up. */
export const AssistantBubble: React.FC<{
  s: Schedule;
  frame: number;
  x: number; // the bubble's left edge
  y: number; // the first line's centre
  maxW: number;
  u: number;
  out?: number;
  accent?: string;
  id: string;
}> = ({ s, frame, x, y, maxW, u, out, accent, id }) => {
  const start = s.start - f60(8);
  const p = spr(frame, start, SPR.firm);
  const q = out === undefined ? 0 : prog(frame, out, out + f60(14), E.exit);
  const o = clamp(p * 1.6) * (1 - q);
  if (o <= 0.002 || frame < start) return null;
  const size = TYPE.ui.size * u;
  const pad = 18 * u;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        maxWidth: maxW,
        padding: `${pad}px ${24 * u}px`,
        borderRadius: 22 * u,
        borderTopLeftRadius: 6 * u,
        background: C.mist,
        opacity: o,
        transform: `translate(${x}px, ${(y - (size * TYPE.ui.lead) / 2 - pad + (1 - p) * 10 * u - q * 60 * u).toFixed(2)}px)`,
      }}
    >
      <Typed s={s} frame={frame} color={C.ink} size={size} accent={accent} id={id} width={maxW - 48 * u} />
    </div>
  );
};

/**
 * The composer: a bordered field at the bottom that a human types into. On `send` it fills ink,
 * the text turns paper, the caret goes, and the box rises to the sent line's place.
 */
export const Composer: React.FC<{
  s: Schedule;
  frame: number;
  x: number;
  y: number;
  w: number;
  u: number;
  send: number;
  out?: number; // the sent line leaves (fades up) from here
  id: string;
}> = ({ s, frame, x, y, w, u, send, out, id }) => {
  const start = s.start - f60(10);
  const p = prog(frame, start, start + f60(14), E.out);
  const q = out === undefined ? 0 : prog(frame, out, out + f60(14), E.exit);
  const o = p * (1 - q);
  if (o <= 0.002 || frame < start) return null;
  const sent = prog(frame, send, send + f60(14), E.ui);
  const size = TYPE.ui.size * u;
  const pad = 18 * u;
  const bg = mixColor(C.paper, C.ink, sent);
  const fg = mixColor(C.ink, C.paper, sent);
  const border = mixColor(C.line, C.ink, sent);
  const sendX = x + w - 30 * u;
  const press = spr(frame, send - f60(4), SPR.micro);
  const btnScale = 1 - 0.1 * press * (1 - prog(frame, send + f60(2), send + f60(10), E.out));
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: w,
        padding: `${pad}px ${72 * u}px ${pad}px ${24 * u}px`,
        borderRadius: 22 * u,
        background: bg,
        border: `2px solid ${border}`,
        boxSizing: 'border-box',
        opacity: o,
        transform: `translate(${x}px, ${(y - (size * TYPE.ui.lead) / 2 - pad + (1 - p) * 12 * u - q * 40 * u).toFixed(2)}px)`,
      }}
    >
      <Typed s={s} frame={frame} color={fg} caret caretOut={send} size={size} id={id} />
      {/* the send button: a filled disc with an up arrow, pressed on `send` */}
      <svg
        width={40 * u}
        height={40 * u}
        viewBox="0 0 40 40"
        style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${sendX - x - 20 * u}px, ${(size * TYPE.ui.lead) / 2 + pad - 20 * u}px) scale(${btnScale.toFixed(3)})`, opacity: 1 - sent }}
      >
        <circle cx="20" cy="20" r="20" fill={C.ink} />
        <path d="M20 28 V13 M14 19 L20 13 L26 19" stroke={C.paper} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

/** The header pill: the ∂ at 22 px and "rederive · linphone". Names the product from frame 0. */
export const HeaderPill: React.FC<{ x: number; y: number; h: number; u: number; opacity?: number; label: string }> = ({ x, y, h, u, opacity = 1, label }) => (
  <div style={{ position: 'absolute', left: 0, top: 0, height: h, display: 'flex', alignItems: 'center', gap: 12 * u, padding: `0 ${18 * u}px 0 ${12 * u}px`, borderRadius: h / 2, border: `1.5px solid ${C.line}`, opacity, transform: `translate(${x}px, ${y}px)` }}>
    <Mark size={22 * u} color={C.ink} />
    <span data-text="header" style={{ ...typeStyle('label', TYPE.label.size * u), color: C.ink }}>{label}</span>
  </div>
);

/** A small chip with a label: the next problems, and the address a phone learns. */
export const Chip: React.FC<{ text: string; x: number; y: number; frame: number; start: number; u: number; fade?: number; filled?: boolean; id: string; anchor?: 'centre' | 'left' }> = ({ text, x, y, frame, start, u, fade = 1, filled = false, id, anchor = 'centre' }) => {
  const p = spr(frame, start, SPR.micro);
  const o = clamp(p * 1.5) * fade;
  if (o <= 0.002 || frame < start) return null;
  const size = TYPE.label.size * u;
  const h = size * 2;
  return (
    <div
      style={{
        position: 'absolute',
        left: anchor === 'centre' ? '50%' : 0,
        top: 0,
        height: h,
        display: 'flex',
        alignItems: 'center',
        padding: `0 ${16 * u}px`,
        borderRadius: h / 2,
        border: `1.5px solid ${filled ? C.ink : C.line}`,
        background: filled ? C.ink : C.paper,
        opacity: o,
        transform: `translate(${anchor === 'centre' ? '-50%' : '0'}, 0) translate(${x}px, ${y - h / 2}px) scale(${(0.9 + 0.1 * p).toFixed(3)})`,
        whiteSpace: 'nowrap',
      }}
    >
      <span data-text={id} style={{ ...typeStyle('label', size), color: filled ? C.paper : C.ink }}>{text}</span>
    </div>
  );
};
