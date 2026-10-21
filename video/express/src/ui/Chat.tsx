import React from 'react';
import { Mark } from '../brand/Mark';
import { C, TYPE, typeStyle } from '../brand/tokens';
import { clamp, E, fd, prog, spr, SPR } from '../lib/anim';
import { mixColor } from '../lib/color';
import { f60 } from '../timeline';
import { Schedule, shownAt } from './typing';

// The chat layer (a HUD above the drawing: the camera never moves it). One rederive bubble at the
// top, one composer or sent line at the bottom. Every piece places itself by transform only.

export const Avatar: React.FC<{ x: number; y: number; size: number; opacity?: number }> = ({ x, y, size, opacity = 1 }) => (
  <div
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
  bold?: string; // a phrase set heavy in the text colour
  size: number;
  width?: number;
  role?: 'ui' | 'secondary';
  align?: 'left' | 'center';
  id: string;
}> = ({ s, frame, color, caret = false, caretOut, accent, bold, size, width, role = 'ui', align = 'left', id }) => {
  const units = s.mode === 'word' ? s.text.split(' ') : s.text.split('');
  const n = shownAt(s, frame);
  const F = fd(frame);
  const typing = n > 0 && n < units.length;
  const blinkOn = typing || Math.floor(Math.abs(F - s.end) / f60(30)) % 2 === 0;
  const showCaret = caret && F >= s.start - f60(6) && (caretOut === undefined || F < caretOut);
  // a phrase's unit range in the text, in chars or words per the schedule's mode
  const range = (phrase?: string): [number, number] => {
    if (!phrase) return [-1, -1];
    const i = s.text.indexOf(phrase);
    if (i < 0) return [-1, -1];
    if (s.mode === 'char') return [i, i + phrase.length];
    const from = s.text.slice(0, i).split(' ').length - 1;
    return [from, from + phrase.split(' ').length];
  };
  const [accentFrom, accentTo] = range(accent);
  const [boldFrom, boldTo] = range(bold);
  return (
    <span data-text={id} style={{ ...typeStyle(role, size), whiteSpace: 'pre-wrap', display: 'block', width, color, textAlign: align }}>
      {units.map((t, i) => {
        const shown = i < n;
        const age = shown ? F - unitFrame(s, i) : 0;
        const o = shown ? clamp((age + 1) / 4) : 0;
        const inAccent = i >= accentFrom && i < accentTo;
        const inBold = inAccent || (i >= boldFrom && i < boldTo);
        return (
          <React.Fragment key={i}>
            {i === n && showCaret && <Caret color={color} size={size} on={blinkOn} />}
            <span style={{ opacity: o, color: inAccent ? C.accent : undefined, fontWeight: inBold ? 650 : undefined }}>{t}</span>
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

/** One digit of the step line rolling up out while the next rolls in from below (ty-staggered-word-roll, one slot). */
const RollDigit: React.FC<{ from: string; to: string; frame: number; at: number; size: number }> = ({ from, to, frame, at, size }) => {
  const q = prog(frame, at, at + f60(12), E.in);
  const p = prog(frame, at + f60(4), at + f60(26), E.out);
  const h = size * TYPE.label.lead;
  return (
    <span style={{ display: 'inline-block', position: 'relative', height: h, width: size * 0.62, overflow: 'hidden', verticalAlign: 'top' }}>
      <span style={{ position: 'absolute', left: 0, top: 0, opacity: 1 - prog(frame, at, at + f60(12), E.smooth), transform: `translateY(${(-0.9 * h * q).toFixed(2)}px)` }}>{from}</span>
      <span style={{ position: 'absolute', left: 0, top: 0, opacity: clamp(p * 1.4), transform: `translateY(${(0.9 * h * (1 - p)).toFixed(2)}px)` }}>{to}</span>
    </span>
  );
};

/**
 * The rederive bubble: avatar, light surface, streamed words. Enters by rising 10 px; exits up.
 * With `step` the bubble opens on `stepAt` with its step line (Problem n of 3) and the text
 * streams beneath it later; the step's number can roll in from the previous one.
 */
export const AssistantBubble: React.FC<{
  s: Schedule;
  frame: number;
  x: number; // the bubble's left edge
  y: number; // the first line's centre
  maxW: number;
  u: number;
  out?: number;
  accent?: string;
  bold?: string;
  step?: { text: string; at: number; id: string; roll?: { from: string; to: string } };
  id: string;
}> = ({ s, frame, x, y, maxW, u, out, accent, bold, step, id }) => {
  const start = step ? step.at : s.start - f60(8);
  const p = spr(frame, start, SPR.firm);
  const q = out === undefined ? 0 : prog(frame, out, out + f60(14), E.exit);
  const o = clamp(p * 1.6) * (1 - q);
  if (o <= 0.002 || frame < start) return null;
  const size = TYPE.ui.size * u;
  const pad = 18 * u;
  const stepSize = TYPE.label.size * u;
  const stepPop = step ? spr(frame, step.at, SPR.micro) : 0;
  const stepO = step ? clamp(stepPop * 1.5) : 0;
  const numAt = step ? step.text.search(/\d/) : -1;
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
      {step && (
        <div data-text={step.id} style={{ ...typeStyle('label', stepSize), color: C.mute, opacity: stepO, marginBottom: 6 * u, transform: `translateY(${((1 - stepPop) * 6 * u).toFixed(2)}px)` }}>
          {step.roll && numAt >= 0 ? (
            <>
              {step.text.slice(0, numAt)}
              <RollDigit from={step.roll.from} to={step.roll.to} frame={frame} at={step.at} size={stepSize} />
              {step.text.slice(numAt + 1)}
            </>
          ) : (
            step.text
          )}
        </div>
      )}
      <Typed s={s} frame={frame} color={C.ink} size={size} accent={accent} bold={bold} id={id} width={maxW - 48 * u} />
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
  rise?: number; // the field rises into place from here (default: 10 f before typing)
  out?: number; // the sent line leaves (fades up) from here
  id: string;
}> = ({ s, frame, x, y, w, u, send, rise, out, id }) => {
  const start = rise ?? s.start - f60(10);
  const p = prog(frame, start, start + f60(14), E.out);
  const q = out === undefined ? 0 : prog(frame, out, out + f60(14), E.exit);
  const o = p * (1 - q);
  if (o <= 0.002 || frame < start) return null;
  const sent = prog(frame, send, send + f60(6), E.ui); // the field fills ink in 6 f: a long cross-mix reads as a grey smear
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

/** The header pill: the ∂ at 22 px and "rederive · express". Names the example from bar 3. */
export const HeaderPill: React.FC<{ x: number; y: number; h: number; u: number; opacity?: number; label: string }> = ({ x, y, h, u, opacity = 1, label }) => (
  <div style={{ position: 'absolute', left: 0, top: 0, height: h, display: 'flex', alignItems: 'center', gap: 12 * u, padding: `0 ${18 * u}px 0 ${12 * u}px`, borderRadius: h / 2, border: `1.5px solid ${C.line}`, opacity, transform: `translate(${x}px, ${y}px)` }}>
    <Mark size={22 * u} color={C.ink} />
    <span data-text="header" style={{ ...typeStyle('label', TYPE.label.size * u), color: C.ink }}>{label}</span>
  </div>
);

/**
 * The repo card: the example, named. Drops in under the command with a landing spring, holds, then
 * its box flies into the header pill's place while its content fades (tr-anchor-overlay-cut).
 */
export const RepoCard: React.FC<{
  frame: number;
  dropStart: number;
  shrink: number; // the flight to the pill starts here
  shrinkDone: number;
  box: { cx: number; cy: number; w: number; h: number };
  pill: { x: number; y: number; w: number; h: number };
  u: number;
  name: string;
  desc: string;
  lang: string;
}> = ({ frame, dropStart, shrink, shrinkDone, box, pill, u, name, desc, lang }) => {
  if (frame < dropStart) return null;
  const s = Math.min(1, spr(frame, dropStart, SPR.firm)); // a firm arrival, no overshoot
  const drop0 = (1 - s) * -220 * u;
  const drop = Math.abs(drop0) < 0.75 ? 0 : drop0; // rest exactly once it has landed: a sub-pixel settle stair-steps
  const sq = 1;
  const fadeIn = prog(frame, dropStart, dropStart + f60(6), E.smooth);
  const m = prog(frame, shrink, shrinkDone, E.inOut);
  if (m >= 1) return null;
  const content = 1 - prog(frame, shrinkDone - f60(8), shrinkDone - f60(2), E.smooth); // the words ride the box into the pill, then hand over
  const x = box.cx - box.w / 2 + (pill.x - (box.cx - box.w / 2)) * m;
  const y = box.cy - box.h / 2 + drop + (pill.y - (box.cy - box.h / 2)) * m;
  const w = box.w + (pill.w - box.w) * m;
  const h = box.h + (pill.h - box.h) * m;
  const radius = 22 * u + (pill.h / 2 - 22 * u) * m;
  const nameSize = TYPE.ui.size * u;
  const descSize = TYPE.label.size * 1.15 * u;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: w,
        height: h,
        borderRadius: radius,
        background: C.paper,
        border: `1.5px solid ${C.line}`,
        boxSizing: 'border-box',
        opacity: fadeIn * (1 - E.in(clamp((m - 0.75) / 0.25))),
        overflow: 'hidden',
        transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${sq.toFixed(4)}, ${(1 / sq).toFixed(4)})`,
        transformOrigin: '50% 100%',
      }}
    >
      <div style={{ position: 'absolute', left: 32 * u, top: 28 * u, opacity: content, width: box.w - 64 * u, transformOrigin: '0 0', transform: `scale(${(w / box.w).toFixed(4)})` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 * u }}>
          <span data-text="repoName" style={{ ...typeStyle('ui', nameSize), fontWeight: 650, color: C.ink }}>{name}</span>
          <span data-text="repoLang" style={{ ...typeStyle('label', TYPE.label.size * u), color: C.mute, border: `1.5px solid ${C.line}`, borderRadius: 999, padding: `${2 * u}px ${12 * u}px` }}>{lang}</span>
        </div>
        <div data-text="repoDesc" style={{ ...typeStyle('label', descSize), color: C.mute, marginTop: 14 * u, whiteSpace: 'pre' }}>{desc}</div>
      </div>
    </div>
  );
};
