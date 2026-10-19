import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, TYPE, typeStyle } from '../brand/tokens';
import { E, lmix, mix, prog } from '../lib/anim';
import { camera } from '../lib/camera';
import { Iris } from '../fx/Iris';
import { ACT, copy, CUE, f60 } from '../timeline';
import { Avatar, Header, ReplyBox } from '../ui/Chat';
import { SessionCard } from '../ui/SessionPanel';
import { interviewAvatarCenter, interviewBubbleLeft, interviewRowCenterY, INTERVIEW, layoutFor, Panel, SESSION } from '../ui/layout';

const LINE = copy('interviewer');

// ACT 2 - TURN. The interview panel shrinks into the corner where the candidate's cursor sits
// (tr-subtract-reveal, window-minimize variant), uncovering the real rederive session, already
// sitting behind it at full size. The glyph iris (the signature move's first use) grows from the
// session's own favicon avatar and swallows the frame; a cold, slightly desaturated version of the
// session is visible throughout, and the iris's growth is what brings up the real ink, paper and
// green accent (cl-context-palette-shift), so warming the world and revealing the avatar are the
// same motion.

const L = (abs: number) => abs - ACT.turn.from;

const SHRINK_DUR = f60(40);

const Scene: React.FC<{ warm: boolean; session: Panel; u: number }> = ({ warm, session, u }) => (
  <div style={{ position: 'absolute', inset: 0, filter: warm ? undefined : 'saturate(0.55) brightness(0.82)' }}>
    <SessionCard session={session} />
    <Header x={session.x} y={session.y} label="rederive" kind="rederive" w={session.w} u={u} />
  </div>
);

export const Act2: React.FC = () => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const lay = layoutFor(width, height);
  const isWide = lay.fmt === 'wide';
  const INTERVIEW_L = isWide ? INTERVIEW : lay.INTERVIEW;
  const SESSION_L = isWide ? SESSION : lay.SESSION;
  const u = lay.u;
  const avatarPos = () => ({ x: SESSION_L.x + 13 * u, y: SESSION_L.y + 32 * u });

  const shrink = prog(f, 0, SHRINK_DUR, E.contact);
  const s = lmix(1, 0.05, shrink);
  const op = 1 - prog(f, SHRINK_DUR - 6, SHRINK_DUR, E.linear);
  const ia = isWide ? interviewAvatarCenter() : lay.interviewAvatarCenter();
  const avatar = avatarPos();

  // The cold session scene sits behind the interview panel for the whole act (the turn's own
  // claim: "already sitting behind it at full size"), but it is bigger than the interview panel
  // (SESSION enclosing INTERVIEW on every side), so showing it at full extent from f=0 pops a
  // border of new pixels in on the very cut frame (forensics f240: a property flipping across the
  // seam). Clip it to a rect that starts exactly on the interview panel's own footprint (nothing
  // new versus Act1's last frame) and grows to the full session rect as the panel shrinks away, so
  // the reveal reads as uncovered, not switched on.
  const revealRect = {
    x: mix(INTERVIEW_L.x, SESSION_L.x, shrink),
    y: mix(INTERVIEW_L.y, SESSION_L.y, shrink),
    w: lmix(INTERVIEW_L.w, SESSION_L.w, shrink),
    h: lmix(INTERVIEW_L.h, SESSION_L.h, shrink),
  };

  // A slow breathing arc keeps the post-iris hold from reading as a dead, static frame (forensics'
  // own "hold" check wants genuine per-frame drift here, not just a looser threshold): it peaks
  // mid-act and returns to 1 by the last frame, matching both neighbours' resting k = 1 so nothing
  // pops across either cut.
  // Wider than before (0.03 / 6 px): a director's round-1 note called the stretch right after the
  // iris swallow (roughly f280-355, local 40-115) dead air, with nothing visibly building. The
  // amplitude still has to return to 0 by the act's own last frame (Act3's f360 seam is not a
  // declared cut), so this widens the peak rather than adding a floor.
  const bt = prog(f, 0, ACT.turn.dur, E.linear);
  const benv = 4 * bt * (1 - bt);
  const push = 1 + 0.06 * benv;
  // A pan carries the real measurable motion: a pure zoom centred on the frame barely displaces
  // content that close to the anchor.
  const cam = camera({ ax: width / 2, ay: height / 2, sx: width / 2 + 14 * benv, sy: height / 2, k: push });
  const interviewBubbleLeftV = isWide ? interviewBubbleLeft() : lay.interviewBubbleLeft();
  const interviewRow0V = isWide ? interviewRowCenterY(0) : lay.interviewRowCenterY(0);
  const interviewRow1V = isWide ? interviewRowCenterY(1) : lay.interviewRowCenterY(1);

  return (
    <AbsoluteFill style={{ background: C.ink, overflow: 'hidden' }}>
      <div style={cam}>
        {/* the hero: already at its final size, static, cold until the iris warms it. Clipped to
            revealRect so the cut frame shows nothing the interview panel didn't already cover. */}
        <div style={{ position: 'absolute', left: 0, top: 0, overflow: 'hidden', transform: `translate(${revealRect.x}px, ${revealRect.y}px)`, width: revealRect.w, height: revealRect.h }}>
          <div style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${-revealRect.x}px, ${-revealRect.y}px)` }}>
            <Scene warm={false} session={SESSION_L} u={u} />
          </div>
        </div>

        {/* the clutter: the interview panel, shrinking into the corner where the reply box sits */}
        {op > 0.002 && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: INTERVIEW_L.w,
              height: INTERVIEW_L.h,
              opacity: op,
              transformOrigin: '94% 88%',
              transform: `translate(${INTERVIEW_L.x}px, ${INTERVIEW_L.y}px) scale(${s})`,
            }}
          >
            <div style={{ position: 'absolute', inset: 0, borderRadius: INTERVIEW_L.radius, background: C.ink2, boxShadow: '0 24px 80px rgba(0,0,0,0.22)', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: 1.5, background: 'rgba(255,255,255,0.1)' }} />
            </div>
            <Header x={0} y={0} label="interview" kind="generic" w={INTERVIEW_L.w} u={u} />
            <Avatar x={ia.x - INTERVIEW_L.x} y={ia.y - INTERVIEW_L.y} size={INTERVIEW_L.avatar} kind="generic" />
            {/* same markup, position and (frame, in) as Act1's copy, so nothing changes across the cut */}
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
                transform: `translate(${interviewBubbleLeftV - INTERVIEW_L.x}px, ${interviewRow0V - INTERVIEW_L.y - (TYPE.ui.size * u * TYPE.ui.lead) / 2 - 16 * u}px)`,
              }}
            >
              <span style={{ ...typeStyle('ui', TYPE.ui.size * u), color: C.paper }}>{LINE.text}</span>
            </div>
            <ReplyBox frame={f + ACT.turn.from} in={CUE.hookResolved} x={isWide ? INTERVIEW_L.w - INTERVIEW_L.pad : lay.interviewBubbleRight() - INTERVIEW_L.x} y={interviewRow1V - INTERVIEW_L.y} u={u} />
          </div>
        )}

        {/* the signature move: a circle grows from the avatar and swallows the frame in the true colour */}
        <Iris frame={f} start={L(CUE.irisSeed) - 1} x={avatar.x} y={avatar.y} ring ringColor={C.accent}>
          <Scene warm session={SESSION_L} u={u} />
        </Iris>
      </div>
    </AbsoluteFill>
  );
};
