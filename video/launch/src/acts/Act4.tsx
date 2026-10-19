import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C } from '../brand/tokens';
import { E, lmix, mix, prog } from '../lib/anim';
import { camera } from '../lib/camera';
import { mixColor } from '../lib/color';
import { ACT, CUE, H, W } from '../timeline';
import { SessionCard, Thread } from '../ui/SessionPanel';
import { avatarCenter, rowCenterY, ROW, SESSION } from '../ui/layout';

// ACT 4 - PAYOFF. "Yes, exactly. You rederived a middleware chain." bolds in the accent the
// instant it lands (cam-detail-first-pullback): tight on the phrase through the hold, then the
// camera pulls back over bar 10 to the whole thread at once. A small pulse on the avatar (the
// signature move's second use) stays inside the shot; it never swallows the frame the way the
// turn's iris did, because nothing here changes scene.

export const Act4: React.FC = () => {
  const f = useCurrentFrame() + ACT.payoff.from;

  const cardCX = SESSION.x + SESSION.w / 2;
  const cardCY = SESSION.y + SESSION.h / 2;
  const ax0 = SESSION.x + SESSION.w * 0.46;
  const ay0 = rowCenterY(ROW.payoff);
  const pull = prog(f, CUE.pullbackStart, CUE.pullbackEnd, E.cam);
  const ax = mix(ax0, cardCX, pull);
  const ay = mix(ay0, cardCY, pull);
  // A slow breathing arc across the whole act, so the tight hold before the pull-back drifts
  // instead of sitting dead, and the act still ends at k = 1 (Act 5 has no camera of its own, so
  // this is the seam that has to land flat) even though the pull-back alone would end there anyway.
  const dt = prog(f, ACT.payoff.from, ACT.payoff.from + ACT.payoff.dur, E.linear);
  const drift = 1 + 0.025 * 4 * dt * (1 - dt);
  const k = lmix(1.6, 1, pull) * drift;
  const cam = camera({ ax, ay, sx: W / 2, sy: H / 2, k });

  const flash = prog(f, CUE.payoffBoldFlash - 1, CUE.payoffBoldFlash + 8, E.smooth);
  const boldColor = mixColor(C.paper, C.accent, flash);
  const payoff = (
    <>
      Yes, exactly. You rederived a <span style={{ color: boldColor, fontWeight: 650 }}>middleware chain</span>.
    </>
  );

  const headerPulse = prog(f, CUE.payoffBoldFlash - 1, CUE.payoffBoldFlash + 20, E.smooth) * (1 - prog(f, CUE.payoffResolved, CUE.payoffHoldTick, E.smooth));

  // The small pulse on the avatar: a circle, accent, that rises and fades without leaving the shot.
  const pa = avatarCenter('payoff');
  const pulse = (() => {
    const t = f - CUE.irisPulse;
    const u = t <= 0 ? 0 : Math.min(1, t / 18);
    const fade = t <= 0 ? 0 : Math.max(0, 1 - t / 30);
    return { scale: 1 + 2.4 * u, o: 0.5 * fade };
  })();

  return (
    <AbsoluteFill style={{ background: C.ink, overflow: 'hidden' }}>
      <div style={cam}>
        <SessionCard />
        <Thread
          frame={f}
          text={{
            problem: 'One function handles every request.',
            naive: 'One big function with if statements.',
            constraint: "Forty routes need it. Miss one, it's open.",
            better: 'Put the check in one function every route calls first.',
            payoff,
          }}
          cue={CUE}
          showPayoffAvatar
          accentPulse={headerPulse}
        />
        {pulse.o > 0.002 && (
          <svg width={SESSION.avatar * 3.6} height={SESSION.avatar * 3.6} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', transform: `translate(${pa.x - SESSION.avatar * 1.8}px, ${pa.y - SESSION.avatar * 1.8}px)` }}>
            <circle cx={SESSION.avatar * 1.8} cy={SESSION.avatar * 1.8} r={(SESSION.avatar / 2) * pulse.scale} fill="none" stroke={C.accent} strokeWidth={2} opacity={pulse.o} />
          </svg>
        )}
      </div>
    </AbsoluteFill>
  );
};
