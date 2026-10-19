import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT, TYPE, typeStyle } from '../brand/tokens';
import { E, lmix, mix, prog } from '../lib/anim';
import { camera } from '../lib/camera';
import { measureTracked } from '../lib/measure';
import { ACT, copy, CUE } from '../timeline';
import { Avatar, Header, ReplyBox } from '../ui/Chat';
import { interviewAvatarCenter, interviewBubbleLeft, interviewRowCenterY, INTERVIEW, layoutFor } from '../ui/layout';

// ACT 1 - HOOK. The film opens cropped tight on "this", the last word of the interviewer's line,
// glyph cut by the frame edge (oh-cropped-word-pull-back): the pull-back over bar 1 is the hook's
// only move. From bar 2 the candidate's reply box sits empty, cursor blinking, nothing sent - the
// film's one designed long hold (HOLD, timeline.ts), the pain felt without a word of narration.
// No accent and a flat grey avatar: this is not yet rederive.

const L = (abs: number) => abs - ACT.hook.from;

const LINE = copy('interviewer');

export const Act1: React.FC = () => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const lay = layoutFor(width, height);
  const isWide = lay.fmt === 'wide';
  // 'wide' keeps the exact static geometry (so the 16:9 master is pixel-identical to before this
  // file became format-aware); 9:16 and 1:1 use the format's own re-centred, re-scaled card instead
  // of INTERVIEW's fixed 1920x1080 position (never a crop of the wide master: formats.md §7).
  const INTERVIEW_L = isWide ? INTERVIEW : lay.INTERVIEW;
  const u = lay.u;
  const size = TYPE.ui.size * u;
  const { weight, track } = TYPE.ui;

  const left = isWide ? interviewBubbleLeft() : lay.interviewBubbleLeft();
  const rowY = isWide ? interviewRowCenterY(0) : lay.interviewRowCenterY(0);
  const ia = isWide ? interviewAvatarCenter() : lay.interviewAvatarCenter();
  const cardCX = INTERVIEW_L.x + INTERVIEW_L.w / 2;
  const cardCY = INTERVIEW_L.y + INTERVIEW_L.h / 2;

  // The word "this" (the period stays with it): crop tight on its centre, then pull back to the
  // interview card's own centre at rest. This signature crop is tuned in 1920x1080 pixel math (the
  // 60 px screen margin, the K0 = 3.2 zoom); on the narrower social frames it would need its own
  // separate tuning pass to read cleanly, so those formats open already settled on the full line
  // instead, holding the same emotional beat (the empty reply box) without the gag.
  const idx = LINE.text.lastIndexOf('this');
  const before = measureTracked(LINE.text.slice(0, idx), size, weight, track, FONT.mono);
  const wordX = left + before;
  const wordY = rowY;

  const pull = isWide ? prog(f, L(CUE.hookIn), L(CUE.hookResolved), E.dolly) : 1;
  const K0 = 3.2;
  // cardCX is always width / 2 (the panel is always horizontally frame-centred), so it is fine on
  // both paths; cardCY is not always height / 2 ('vertical' bottom-anchors the panel off true
  // centre, see layout.ts), so the non-wide path anchors on the frame's own centre instead of the
  // panel's, or the camera would recentre the deliberately off-centre panel back to mid-frame.
  const ax = isWide ? mix(wordX, cardCX, pull) : cardCX;
  const ay = isWide ? mix(wordY, cardCY, pull) : height / 2;
  const sx = isWide ? mix(60 * u, width / 2, pull) : width / 2;
  const sy = height / 2;
  // A slow breathing arc through the hold: the blinking caret alone reads as a stalled player to
  // a frame-diff (forensics), so the frame keeps drifting even while nothing new is said. It peaks
  // mid-hold and returns to 1 by the act's last frame, so both seams (the pull-back's own end, and
  // Act 2's fresh k = 1 start) land at the same scale with nothing to pop across the cut.
  // A pure zoom around the card's own centre barely displaces the card's own content (it is all
  // close to the anchor), so a few px of pan carries the real, measurable motion; the small zoom
  // rides along for a touch of depth. Same envelope, so both return to the neighbours' resting pose.
  const t = prog(f, isWide ? L(CUE.hookResolved) : 0, ACT.hook.dur, E.linear);
  const env = 4 * t * (1 - t);
  const holdPush = 1 + 0.02 * env;
  const k = (isWide ? lmix(K0, 1, pull) : 1) * holdPush;
  const cam = camera({ ax, ay, sx: sx + 6 * env, sy, k });

  return (
    <AbsoluteFill style={{ background: C.ink, overflow: 'hidden' }}>
      <div style={cam}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: INTERVIEW_L.w,
            height: INTERVIEW_L.h,
            borderRadius: INTERVIEW_L.radius,
            background: C.ink2,
            boxShadow: '0 24px 80px rgba(0,0,0,0.22)',
            overflow: 'hidden',
            transform: `translate(${INTERVIEW_L.x}px, ${INTERVIEW_L.y}px)`,
          }}
        >
          <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: 1.5, background: 'rgba(255,255,255,0.1)' }} />
        </div>
        <Header x={INTERVIEW_L.x} y={INTERVIEW_L.y} label="interview" kind="generic" w={INTERVIEW_L.w} u={u} />
        <Avatar x={ia.x} y={ia.y} size={INTERVIEW_L.avatar} kind="generic" />
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            maxWidth: 1040 * u,
            padding: `${16 * u}px ${20 * u}px`,
            borderRadius: 16 * u,
            background: C.ink2,
            border: `1.5px solid ${C.line}`,
            transform: `translate(${left}px, ${rowY - (size * TYPE.ui.lead) / 2 - 16 * u}px)`,
          }}
        >
          {/* data-text on the span: the padded box has no font-size of its own, so tagging it
              reads the inherited default instead of this line's real, camera-scaled size. */}
          <span data-text="interviewer" style={{ ...typeStyle('ui', size), color: C.paper }}>{LINE.text}</span>
        </div>
        <ReplyBox frame={f} in={isWide ? L(CUE.hookResolved) : 0} x={isWide ? INTERVIEW_L.x + INTERVIEW_L.w - INTERVIEW_L.pad : lay.interviewBubbleRight()} y={isWide ? interviewRowCenterY(1) : lay.interviewRowCenterY(1)} u={u} />
      </div>
    </AbsoluteFill>
  );
};
