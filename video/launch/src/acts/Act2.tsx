import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C } from '../brand/tokens';
import { E, lmix, prog } from '../lib/anim';
import { breath, camera } from '../lib/camera';
import { Iris } from '../fx/Iris';
import { ACT, CUE, f60, H, W } from '../timeline';
import { Avatar, Header, ReplyBox } from '../ui/Chat';
import { SessionCard } from '../ui/SessionPanel';
import { interviewAvatarCenter, interviewRowCenterY, INTERVIEW, SESSION } from '../ui/layout';

// ACT 2 - TURN. The interview panel shrinks into the corner where the candidate's cursor sits
// (tr-subtract-reveal, window-minimize variant), uncovering the real rederive session, already
// sitting behind it at full size. The glyph iris (the signature move's first use) grows from the
// session's own favicon avatar and swallows the frame; a cold, slightly desaturated version of the
// session is visible throughout, and the iris's growth is what brings up the real ink, paper and
// green accent (cl-context-palette-shift), so warming the world and revealing the avatar are the
// same motion.

const L = (abs: number) => abs - ACT.turn.from;

const SHRINK_DUR = f60(40);
const avatarPos = () => ({ x: SESSION.x + 13, y: SESSION.y + 32 });

const Scene: React.FC<{ warm: boolean }> = ({ warm }) => (
  <div style={{ position: 'absolute', inset: 0, filter: warm ? undefined : 'saturate(0.55) brightness(0.82)' }}>
    <SessionCard />
    <Header x={SESSION.x} y={SESSION.y} label="rederive" kind="rederive" w={SESSION.w} />
  </div>
);

export const Act2: React.FC = () => {
  const f = useCurrentFrame();

  const shrink = prog(f, 0, SHRINK_DUR, E.contact);
  const s = lmix(1, 0.05, shrink);
  const op = 1 - prog(f, SHRINK_DUR - 6, SHRINK_DUR, E.linear);
  const ia = interviewAvatarCenter();
  const avatar = avatarPos();

  // A very slow breath keeps the post-iris hold from reading as a dead frame: the session is
  // real and alive even before the first message, not a static screenshot.
  const push = breath(prog(f, 0, ACT.turn.dur, E.linear), 0.02);
  const cam = camera({ ax: W / 2, ay: H / 2, sx: W / 2, sy: H / 2, k: push });

  return (
    <AbsoluteFill style={{ background: C.ink, overflow: 'hidden' }}>
      <div style={cam}>
        {/* the hero: already at its final size, static, cold until the iris warms it */}
        <Scene warm={false} />

        {/* the clutter: the interview panel, shrinking into the corner where the reply box sits */}
        {op > 0.002 && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: INTERVIEW.w,
              height: INTERVIEW.h,
              opacity: op,
              transformOrigin: '94% 88%',
              transform: `translate(${INTERVIEW.x}px, ${INTERVIEW.y}px) scale(${s})`,
            }}
          >
            <div style={{ position: 'absolute', inset: 0, borderRadius: INTERVIEW.radius, background: C.ink2, boxShadow: '0 24px 80px rgba(0,0,0,0.22)', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: 1.5, background: 'rgba(255,255,255,0.1)' }} />
            </div>
            <Header x={0} y={0} label="interview" kind="generic" w={INTERVIEW.w} />
            <Avatar x={ia.x - INTERVIEW.x} y={ia.y - INTERVIEW.y} size={INTERVIEW.avatar} kind="generic" />
            <ReplyBox frame={f} in={-1000} x={INTERVIEW.w - INTERVIEW.pad} y={interviewRowCenterY(1) - INTERVIEW.y} />
          </div>
        )}

        {/* the signature move: a circle grows from the avatar and swallows the frame in the true colour */}
        <Iris frame={f} start={L(CUE.irisSeed) - 1} x={avatar.x} y={avatar.y} ring ringColor={C.accent}>
          <Scene warm />
        </Iris>
      </div>
    </AbsoluteFill>
  );
};
