import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C } from '../brand/tokens';
import { E, hitPulse, mix, prog } from '../lib/anim';
import { camera } from '../lib/camera';
import { ACT, CUE, H, W } from '../timeline';
import { SessionCard, Thread } from '../ui/SessionPanel';
import { rowCenterY, ROW, SESSION } from '../ui/layout';

// ACT 3 - PROOF. The problem lands with no solution words, the naive answer, the constraint that
// breaks it (the camera's one hero move here: a push onto the line that breaks it), a held beat
// while the user revises, the better answer. The product has been named in its own chrome since
// the turn (Act 2's header), well inside the brief's "about a quarter of the runtime".
//
// Cue frames below are absolute (CUE.*); Thread and the ring/bubble components all take the
// absolute frame directly, so nothing here re-derives act-local timing by hand.

export const Act3: React.FC = () => {
  const f = useCurrentFrame() + ACT.proof.from;

  const cardCX = SESSION.x + SESSION.w / 2;
  const cardCY = SESSION.y + SESSION.h / 2;
  const push = hitPulse(f - CUE.pushInPeak, 20, 24);
  const ax = mix(cardCX, SESSION.x + SESSION.w * 0.4, push);
  const ay = mix(cardCY, rowCenterY(ROW.constraint), push);
  // A slow breathing arc under the whole act (peaks mid-act, returns to 1 by the last frame), so
  // the long reading pauses between messages still drift instead of reading as a stalled player,
  // and the act both opens and closes at k = 1 to match its neighbours (Act 2's hold, Act 4's cut).
  const dt = prog(f, ACT.proof.from, ACT.proof.from + ACT.proof.dur, E.linear);
  const drift = 1 + 0.03 * 4 * dt * (1 - dt);
  const k = (1 + 0.26 * push) * drift;
  const cam = camera({ ax, ay, sx: W / 2, sy: H / 2, k });

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
            payoff: '',
          }}
          cue={CUE}
          showPayoffAvatar={false}
        />
      </div>
    </AbsoluteFill>
  );
};
