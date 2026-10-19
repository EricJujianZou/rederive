import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, TYPE, U, typeStyle } from '../brand/tokens';
import { E, prog } from '../lib/anim';
import { camera } from '../lib/camera';
import { measureTracked } from '../lib/measure';
import { ACT, copy, CUE, H, W } from '../timeline';
import { Avatar, Header, ReplyBox } from '../ui/Chat';
import { interviewAvatarCenter, interviewBubbleLeft, interviewRowCenterY, INTERVIEW } from '../ui/layout';

// ACT 1 - HOOK. The film opens cropped tight on "this", the last word of the interviewer's line,
// glyph cut by the frame edge (oh-cropped-word-pull-back): the pull-back over bar 1 is the hook's
// only move. From bar 2 the candidate's reply box sits empty, cursor blinking, nothing sent - the
// film's one designed long hold (HOLD, timeline.ts), the pain felt without a word of narration.
// No accent and a flat grey avatar: this is not yet rederive.

const L = (abs: number) => abs - ACT.hook.from;

const LINE = copy('interviewer');

export const Act1: React.FC = () => {
  const f = useCurrentFrame();
  const size = TYPE.ui.size * U;
  const { weight, track } = TYPE.ui;

  // The word "this" (the period stays with it): crop tight on its centre, then pull back to the
  // interview card's own centre at rest.
  const idx = LINE.text.lastIndexOf('this');
  const before = measureTracked(LINE.text.slice(0, idx), size, weight, track);
  const wordW = measureTracked('this.', size, weight, track);
  const left = interviewBubbleLeft();
  const rowY = interviewRowCenterY(0);
  const wordX = left + before + wordW / 2;
  const wordY = rowY;

  const cardCX = INTERVIEW.x + INTERVIEW.w / 2;
  const cardCY = INTERVIEW.y + INTERVIEW.h / 2;

  const pull = prog(f, L(CUE.hookPullStart), L(CUE.hookResolved), E.dolly);
  const ax = wordX + (cardCX - wordX) * pull;
  const ay = wordY + (cardCY - wordY) * pull;
  const k = 1 + (3.2 - 1) * (1 - pull);
  const cam = camera({ ax, ay, sx: W / 2, sy: H / 2, k });

  const ia = interviewAvatarCenter();

  return (
    <AbsoluteFill style={{ background: C.ink, overflow: 'hidden' }}>
      <div style={cam}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: INTERVIEW.w,
            height: INTERVIEW.h,
            borderRadius: INTERVIEW.radius,
            background: C.ink2,
            boxShadow: '0 24px 80px rgba(0,0,0,0.22)',
            overflow: 'hidden',
            transform: `translate(${INTERVIEW.x}px, ${INTERVIEW.y}px)`,
          }}
        >
          <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: 1.5, background: 'rgba(255,255,255,0.1)' }} />
        </div>
        <Header x={INTERVIEW.x} y={INTERVIEW.y} label="interview" kind="generic" w={INTERVIEW.w} />
        <Avatar x={ia.x} y={ia.y} size={INTERVIEW.avatar} kind="generic" />
        <div
          data-text="interviewer"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            maxWidth: 1040 * U,
            padding: `${16 * U}px ${20 * U}px`,
            borderRadius: 16 * U,
            background: C.ink2,
            border: `1.5px solid ${C.line}`,
            transform: `translate(${left}px, ${rowY - (size * TYPE.ui.lead) / 2 - 16 * U}px)`,
          }}
        >
          <span style={{ ...typeStyle('ui', size), color: C.paper }}>{LINE.text}</span>
        </div>
        <ReplyBox frame={f} in={L(CUE.hookResolved)} x={INTERVIEW.x + INTERVIEW.w - INTERVIEW.pad} y={interviewRowCenterY(1)} />
      </div>
    </AbsoluteFill>
  );
};
