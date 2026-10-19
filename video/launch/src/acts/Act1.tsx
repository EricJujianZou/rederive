import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, FONT, TYPE, U, typeStyle } from '../brand/tokens';
import { E, lmix, mix, prog } from '../lib/anim';
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
  // The line itself renders in Geist Mono (typeStyle('ui', ...) below): measure it in that face,
  // not the default display face, or the prefix width undershoots and the crop anchors a few
  // characters early (it landed on "through" instead of "this").
  const before = measureTracked(LINE.text.slice(0, idx), size, weight, track, FONT.mono);
  const left = interviewBubbleLeft();
  const rowY = interviewRowCenterY(0);
  // Anchor the word's own left edge near the frame's left edge (not its centre), so the crop
  // reads as cut into the sentence, not as the whole line zoomed in place.
  const wordX = left + before;
  const wordY = rowY;

  const cardCX = INTERVIEW.x + INTERVIEW.w / 2;
  const cardCY = INTERVIEW.y + INTERVIEW.h / 2;

  // Starts at frame 0, not CUE.hookPullStart: the hook law wants frame 0 already moving, and a
  // held, perfectly static crop for the first half-second reads as a stalled player (forensics
  // flagged exactly this).
  const pull = prog(f, L(CUE.hookIn), L(CUE.hookResolved), E.dolly);
  const K0 = 3.2;
  const ax = mix(wordX, cardCX, pull);
  const ay = mix(wordY, cardCY, pull);
  const sx = mix(60 * U, W / 2, pull);
  const sy = mix(H / 2, H / 2, pull);
  // A slow breathing arc through the hold: the blinking caret alone reads as a stalled player to
  // a frame-diff (forensics), so the frame keeps drifting even while nothing new is said. It peaks
  // mid-hold and returns to 1 by the act's last frame, so both seams (the pull-back's own end, and
  // Act 2's fresh k = 1 start) land at the same scale with nothing to pop across the cut.
  // A pure zoom around the card's own centre barely displaces the card's own content (it is all
  // close to the anchor), so a few px of pan carries the real, measurable motion; the small zoom
  // rides along for a touch of depth. Same envelope, so both return to the neighbours' resting pose.
  const t = prog(f, L(CUE.hookResolved), ACT.hook.dur, E.linear);
  const env = 4 * t * (1 - t);
  const holdPush = 1 + 0.02 * env;
  const k = lmix(K0, 1, pull) * holdPush;
  const cam = camera({ ax, ay, sx: sx + 6 * env, sy, k });

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
          {/* data-text on the span: the padded box has no font-size of its own, so tagging it
              reads the inherited default instead of this line's real, camera-scaled size. */}
          <span data-text="interviewer" style={{ ...typeStyle('ui', size), color: C.paper }}>{LINE.text}</span>
        </div>
        <ReplyBox frame={f} in={L(CUE.hookResolved)} x={INTERVIEW.x + INTERVIEW.w - INTERVIEW.pad} y={interviewRowCenterY(1)} />
      </div>
    </AbsoluteFill>
  );
};
