import React from 'react';
import { C } from '../brand/tokens';
import { E, prog } from '../lib/anim';
import { f60 } from '../timeline';
import { Avatar, Bubble, Header, ReplyBox, ThinkingRing, TypedBubble } from './Chat';
import { avatarCenter, bubbleLeft, ROW, rowCenterY, SESSION } from './layout';

export type Rect = { x: number; y: number; w: number; h: number; radius: number };

/**
 * The container itself (TREATMENT.md §3): just the card, so `rect` can move and resize it for the
 * lockup's collapse without touching the thread inside (which fades out first; see Thread).
 */
export const SessionCard: React.FC<{ rect?: Rect; opacity?: number }> = ({ rect, opacity = 1 }) => {
  const r = rect ?? { x: SESSION.x, y: SESSION.y, w: SESSION.w, h: SESSION.h, radius: SESSION.radius };
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: r.w,
        height: r.h,
        borderRadius: r.radius,
        background: C.ink2,
        boxShadow: '0 24px 80px rgba(0,0,0,0.22)',
        opacity,
        overflow: 'hidden',
        transform: `translate(${r.x}px, ${r.y}px)`,
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: 1.5, background: 'rgba(255,255,255,0.1)' }} />
    </div>
  );
};

export type ThreadText = { problem: string; naive: string; constraint: string; better: string; payoff: React.ReactNode };
export type ThreadCue = {
  ringAppear1: number; ringResolve1: number; problemOut: number;
  naiveTypeStart: number; naiveResolved: number; naiveOut: number;
  ringAppear2: number; ringResolve2: number; constraintOut: number;
  replyBoxAppear: number; betterIn: number; betterResolved: number; betterOut: number;
  ringAppear3: number; ringResolveBright: number; payoffIn: number;
};

/** The message thread at its fixed, never-scrolling row positions (layout.ts): the five messages
 * fit the session card without a scroll, so nothing here needs to know the card's own (x, y). */
export const Thread: React.FC<{
  frame: number;
  contentOpacity?: number;
  showPayoffAvatar?: boolean;
  accentPulse?: number;
  text: ThreadText;
  cue: ThreadCue;
  /** A second, independent fade for every row but the payoff: how much of the rest of the
   * thread shows while the camera is framed tight on the payoff line alone (Act4's hold between
   * the ring resolving and the pull-back). 1 everywhere else. */
  otherRowsOpacity?: number;
}> = ({ frame, contentOpacity = 1, showPayoffAvatar = true, accentPulse = 0, text, cue, otherRowsOpacity = 1 }) => {
  const left = bubbleLeft();
  const o = contentOpacity;
  if (o <= 0.002) return null;
  const pa = avatarCenter('problem');
  const ca = avatarCenter('constraint');
  const pya = avatarCenter('payoff');
  const d = otherRowsOpacity;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', opacity: o }}>
      <Header x={SESSION.x} y={SESSION.y} label="rederive" kind="rederive" accentPulse={accentPulse} w={SESSION.w} />

      <Avatar x={pa.x} y={pa.y} size={SESSION.avatar} kind="rederive" opacity={d * prog(frame, cue.ringAppear1, cue.ringAppear1 + f60(10), E.smooth)} />
      <ThinkingRing x={pa.x} y={pa.y} frame={frame} start={cue.ringAppear1} end={cue.ringResolve1} />
      <Bubble text={text.problem} frame={frame} in={cue.ringResolve1} x={left} y={rowCenterY(ROW.problem)} align="left" dim={frame >= cue.problemOut ? prog(frame, cue.problemOut, cue.problemOut + f60(24), E.smooth) : 0} opacity={d} />

      {/* cps 20 (was 16): at 16 the line was still typing when the next ring (ringAppear2) had
          already started spinning, 15 f after the real last key, not before it. caretOut follows
          the real completion, not the declared (and, at the old cps, already wrong) naiveResolved
          cue, so the caret never vanishes mid-key. */}
      <TypedBubble text={text.naive} frame={frame} x={SESSION.x + SESSION.w - SESSION.pad} y={rowCenterY(ROW.naive)} timing={{ start: cue.naiveTypeStart, cps: 20 }} caretOut={cue.naiveTypeStart + Math.ceil((text.naive.length * 60) / 20) + f60(6)} dim={frame >= cue.naiveOut ? prog(frame, cue.naiveOut, cue.naiveOut + f60(24), E.smooth) : 0} opacity={d} />

      <Avatar x={ca.x} y={ca.y} size={SESSION.avatar} kind="rederive" opacity={d * prog(frame, cue.ringAppear2, cue.ringAppear2 + f60(10), E.smooth)} />
      <ThinkingRing x={ca.x} y={ca.y} frame={frame} start={cue.ringAppear2} end={cue.ringResolve2} />
      <Bubble text={text.constraint} frame={frame} in={cue.ringResolve2} x={left} y={rowCenterY(ROW.constraint)} align="left" dim={frame >= cue.constraintOut ? prog(frame, cue.constraintOut, cue.constraintOut + f60(24), E.smooth) : 0} opacity={d} />

      <ReplyBox frame={frame} in={cue.replyBoxAppear} out={cue.betterIn} x={SESSION.x + SESSION.w - SESSION.pad} y={rowCenterY(ROW.better)} />
      {/* cps 30 (was 20): at 20 this 54-character line was still typing at frame 1002, after
          ringAppear3 (960) had already started, so rederive read as answering before the human
          finished the sentence it was answering. caretOut follows the real completion. */}
      <TypedBubble text={text.better} frame={frame} x={SESSION.x + SESSION.w - SESSION.pad} y={rowCenterY(ROW.better)} timing={{ start: cue.betterIn, cps: 30 }} caretOut={cue.betterIn + Math.ceil((text.better.length * 60) / 30) + f60(6)} dim={frame >= cue.betterOut ? prog(frame, cue.betterOut, cue.betterOut + f60(24), E.smooth) : 0} opacity={d} />

      {showPayoffAvatar && (
        <Avatar x={pya.x} y={pya.y} size={SESSION.avatar} kind="rederive" opacity={prog(frame, cue.ringAppear3, cue.ringAppear3 + f60(10), E.smooth)} />
      )}
      <ThinkingRing x={pya.x} y={pya.y} frame={frame} start={cue.ringAppear3} end={cue.ringResolveBright} bright />
      <Bubble text="" accent={text.payoff} frame={frame} in={cue.payoffIn} x={left} y={rowCenterY(ROW.payoff)} align="left" />
    </div>
  );
};
